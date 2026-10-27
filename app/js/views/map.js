// V1 - Choropleth map of the homicide rate per 100k in the brushed period.
// Requirements: R2 (locate high-rate cantons), R3 (select), R5 (uncertainty).
//
// Encoding decisions (Munzner level 3):
// - Rate classes with fixed breaks (doubling: 5, 10, 20, 40, 80 per 100k), so
//   colors stay comparable when the brushed period changes.
// - Reversed viridis: darker = higher rate; perceptually ordered and
//   colorblind-safe.
// - Zero victims -> white (a true zero, not missing data).
// - Fewer than MIN_CASES victims in the period -> hatched (unstable rate).
// - Galápagos in an inset drawn at the same scale as the mainland, so areas
//   remain comparable; only its position is moved.

import { state, events, toggleCanton, colorOf, isSelected, MIN_CASES, LAST_YEAR } from "../state.js";
import { periodStats } from "../data.js";
import { showTooltip, moveTooltip, hideTooltip, fmtInt, fmtRate, niceName } from "../tooltip.js";

const W = 640;
const H = 600;
const BREAKS = [5, 10, 20, 40, 80];
const COLORS = BREAKS.concat(null).map((_, i, a) => d3.interpolateViridis(1 - (i + 0.5) / a.length));
const ZERO_FILL = "#ffffff";

const color = d3.scaleThreshold().domain(BREAKS).range(COLORS);

let svg, paths, hatch, selectionLayer, features, data, statsByCode;

export function initMap(container, _data) {
  data = _data;
  const topo = data.topo;
  const mainland = topojson.feature(topo, topo.objects.continente);
  const galapagos = topojson.feature(topo, topo.objects.galapagos);

  svg = d3
    .select(container)
    .append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`)
    .attr("role", "img")
    .attr("aria-label", "Mapa de Ecuador por cantón con la tasa de homicidios por 100 mil habitantes en el periodo seleccionado");

  // Hatch pattern: alternating light and dark strokes so it is visible on
  // both ends of the viridis ramp.
  const defs = svg.append("defs");
  const pat = defs
    .append("pattern")
    .attr("id", "hatch")
    .attr("patternUnits", "userSpaceOnUse")
    .attr("width", 6)
    .attr("height", 6)
    .attr("patternTransform", "rotate(45)");
  pat.append("line").attr("x1", 0).attr("y1", 0).attr("x2", 0).attr("y2", 6).attr("stroke", "#fff").attr("stroke-width", 2).attr("stroke-opacity", 0.85);
  pat.append("line").attr("x1", 3).attr("y1", 0).attr("x2", 3).attr("y2", 6).attr("stroke", "#222").attr("stroke-width", 1).attr("stroke-opacity", 0.45);

  // Projections: mainland fills the right side; Galápagos goes into an inset
  // at the top left, at the same scale when it fits.
  const projMain = d3.geoMercator().fitExtent([[190, 12], [W - 12, H - 12]], mainland);
  const inset = { x: 10, y: 12, w: 200, h: 170 };
  const projGal = d3.geoMercator().fitExtent([[inset.x + 10, inset.y + 22], [inset.x + inset.w - 10, inset.y + inset.h - 10]], galapagos);
  const sameScale = projGal.scale() >= projMain.scale();
  if (sameScale) {
    // Same scale as the mainland, centered on the archipelago's bounding box
    const [[lon0, lat0], [lon1, lat1]] = d3.geoBounds(galapagos);
    projGal
      .scale(projMain.scale())
      .center([(lon0 + lon1) / 2, (lat0 + lat1) / 2])
      .translate([inset.x + inset.w / 2, inset.y + 12 + (inset.h - 12) / 2]);
  }
  const pathMain = d3.geoPath(projMain);
  const pathGal = d3.geoPath(projGal);

  features = [
    ...mainland.features.map((f) => ({ f, path: pathMain })),
    ...galapagos.features.map((f) => ({ f, path: pathGal })),
  ].map(({ f, path }) => ({ code: f.properties.codigo_canton, d: path(f) }));

  const g = svg.append("g").attr("class", "cantons");

  // Inset frame
  g.append("rect")
    .attr("class", "inset-frame")
    .attr("x", inset.x)
    .attr("y", inset.y)
    .attr("width", inset.w)
    .attr("height", inset.h);
  g.append("text")
    .attr("class", "inset-label")
    .attr("x", inset.x + 8)
    .attr("y", inset.y + 15)
    .text(sameScale ? "Galápagos (misma escala, posición desplazada)" : "Galápagos (escala distinta)");

  paths = g
    .selectAll("path.canton")
    .data(features, (d) => d.code)
    .join("path")
    .attr("class", "canton")
    .attr("d", (d) => d.d)
    .on("pointerenter", onEnter)
    .on("pointermove", (event) => moveTooltip(event))
    .on("pointerleave", onLeave)
    .on("click", onClick);

  // Hatch overlay for unstable rates (no pointer events: clicks go to the canton)
  hatch = svg.append("g").attr("class", "hatch-layer").attr("pointer-events", "none");
  // Outlines of selected cantons, drawn on top
  selectionLayer = svg.append("g").attr("class", "selection-layer").attr("pointer-events", "none");

  drawLegend();

  events.on("period.map", update);
  events.on("selection.map", updateSelection);
  update();
}

function computeStats() {
  statsByCode = new Map();
  for (const { code } of features) {
    statsByCode.set(code, periodStats(data.annualByCanton.get(code) || [], state.period));
  }
}

function fillOf(code) {
  const s = statsByCode.get(code);
  if (!s || s.rate == null) return "#ccc"; // no population: should not happen (all 221 match)
  if (s.victims === 0) return ZERO_FILL;
  return color(s.rate);
}

function update() {
  const t0 = performance.now();
  computeStats();
  paths
    .attr("fill", (d) => fillOf(d.code))
    .classed("is-zero", (d) => statsByCode.get(d.code).victims === 0);

  const unstable = features.filter((d) => {
    const s = statsByCode.get(d.code);
    return s.victims > 0 && s.victims < MIN_CASES;
  });
  hatch
    .selectAll("path")
    .data(unstable, (d) => d.code)
    .join("path")
    .attr("d", (d) => d.d)
    .attr("fill", "url(#hatch)");

  updateSelection();
  console.info(`[perf] map update ${(performance.now() - t0).toFixed(1)} ms`);
}

function updateSelection() {
  const selected = features.filter((d) => isSelected(d.code));
  selectionLayer
    .selectAll("path")
    .data(selected, (d) => d.code)
    .join((enter) => enter.append("path").attr("d", (d) => d.d))
    .attr("stroke", (d) => colorOf(d.code));
  paths.classed("is-selected", (d) => isSelected(d.code));
}

function onEnter(event, d) {
  d3.select(this).raise().classed("is-hover", true);
  const info = data.cantons.get(d.code);
  const s = statsByCode.get(d.code);
  const [from, to] = state.period;
  const periodLabel = from === to ? `${from}` : `${from}–${to}`;
  const notes = [];
  if (s.victims === 0) notes.push("Sin homicidios registrados en el periodo (cero real).");
  else if (s.victims < MIN_CASES) notes.push(`Menos de ${MIN_CASES} víctimas: tasa inestable.`);
  if (to === LAST_YEAR) notes.push("2026: enero–agosto, datos preliminares.");
  showTooltip(
    event,
    `<strong>${niceName(info.canton)}</strong>
     <div class="tt-sub">Periodo ${periodLabel}</div>
     <table>
       <tr><td>Víctimas</td><td>${fmtInt(s.victims)}</td></tr>
       <tr><td>Población (${to})</td><td>${fmtInt(s.population)}</td></tr>
       <tr><td>Tasa por 100 mil hab./año</td><td><b>${fmtRate(s.rate)}</b></td></tr>
     </table>
     ${notes.map((n) => `<div class="tt-note">${n}</div>`).join("")}
     <div class="tt-hint">${isSelected(d.code) ? "Clic para quitar de la selección" : "Clic para seleccionar"}</div>`
  );
}

function onLeave() {
  d3.select(this).classed("is-hover", false);
  hideTooltip();
}

function onClick(event, d) {
  const ok = toggleCanton(d.code);
  if (!ok) {
    d3.select("#selection-msg").text("Máximo 5 cantones. Quita uno para agregar otro.").classed("visible", true);
    setTimeout(() => d3.select("#selection-msg").classed("visible", false), 2500);
  }
  onEnter.call(this, event, d); // refresh the hint text
}

function drawLegend() {
  const lg = svg.append("g").attr("class", "legend").attr("transform", `translate(14, ${H - 230})`);
  lg.append("text").attr("class", "legend-title").attr("y", 0).text("Tasa por 100 mil hab./año");

  const items = [
    { fill: ZERO_FILL, label: "0 (sin homicidios)" },
    ...COLORS.map((c, i) => ({
      fill: c,
      label: i === 0 ? `< ${BREAKS[0]}` : i === COLORS.length - 1 ? `≥ ${BREAKS[i - 1]}` : `${BREAKS[i - 1]} – < ${BREAKS[i]}`,
    })),
    { fill: "url(#hatch)", under: COLORS[2], label: `< ${MIN_CASES} víctimas (inestable)` },
  ];
  const row = lg
    .selectAll("g.item")
    .data(items)
    .join("g")
    .attr("class", "item")
    .attr("transform", (_, i) => `translate(0, ${14 + i * 22 + (i === items.length - 1 ? 8 : 0)})`);
  row.filter((d) => d.under).append("rect").attr("width", 22).attr("height", 16).attr("fill", (d) => d.under);
  row.append("rect").attr("width", 22).attr("height", 16).attr("fill", (d) => d.fill).attr("stroke", "#999").attr("stroke-width", 0.5);
  row.append("text").attr("x", 30).attr("y", 12).text((d) => d.label);
}
