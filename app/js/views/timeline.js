// V2 - Monthly timeline of the 3-month annualized rate per 100k.
// Requirements: R1 (monthly evolution, national + selected), R5 (2026 is
// preliminary), and the brush that sets the period for V1 (and V4 later).
//
// Encoding decisions (Munzner level 3):
// - National line in gray as permanent context; selected cantons in their
//   Okabe-Ito color with a direct label at the line end (not color alone).
// - 2026 drawn dashed and on a shaded band: partial and preliminary data.
// - The brush lives on its own track under the x axis so it does not compete
//   with hover, and it snaps to whole years because rates use annual
//   population (keeps rates consistent across views).

import { state, events, setPeriod, colorOf, FIRST_YEAR, LAST_YEAR, LAST_MONTH } from "../state.js";
import { showTooltip, moveTooltip, hideTooltip, fmtRate, fmtMonth, niceName } from "../tooltip.js";

const W = 760;
const H = 420;
const M = { top: 30, right: 130, bottom: 78, left: 52 };
const BRUSH_H = 26;
const PRELIM_START = new Date(Date.UTC(LAST_YEAR, 0, 1));
const X_END = new Date(Date.UTC(LAST_YEAR, LAST_MONTH, 1)); // first day after the last month

let data, svg, x, y, gLines, gLabels, gPeriod, gBrush, brush, yAxisG, hoverG, plotH;

export function initTimeline(container, _data) {
  data = _data;
  plotH = H - M.top - M.bottom;

  svg = d3
    .select(container)
    .append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`)
    .attr("role", "img")
    .attr("aria-label", "Línea de tiempo mensual de la tasa de homicidios: nacional y cantones seleccionados");

  const g = svg.append("g").attr("transform", `translate(${M.left},${M.top})`);
  const innerW = W - M.left - M.right;

  x = d3.scaleUtc().domain([new Date(Date.UTC(FIRST_YEAR, 0, 1)), X_END]).range([0, innerW]);
  y = d3.scaleLinear().range([plotH, 0]);

  // Brushed period (shaded behind the lines)
  gPeriod = g.append("g").attr("class", "period-band");
  gPeriod.append("rect").attr("y", 0).attr("height", plotH);

  // Preliminary 2026 band
  g.append("rect")
    .attr("class", "prelim-band")
    .attr("x", x(PRELIM_START))
    .attr("width", x(X_END) - x(PRELIM_START))
    .attr("y", 0)
    .attr("height", plotH);
  g.append("text")
    .attr("class", "prelim-label")
    .attr("x", x(PRELIM_START) + 4)
    .attr("y", 12)
    .text("2026 prelim.");

  g.append("g")
    .attr("class", "axis x-axis")
    .attr("transform", `translate(0,${plotH})`)
    .call(d3.axisBottom(x).ticks(d3.utcYear.every(1)).tickFormat(d3.utcFormat("%Y")));
  yAxisG = g.append("g").attr("class", "axis y-axis");
  g.append("text")
    .attr("class", "axis-title")
    .attr("x", -M.left + 4)
    .attr("y", -16)
    .text("Tasa por 100 mil hab. (anualizada, media móvil de 3 meses)");

  gLines = g.append("g").attr("class", "lines");
  gLabels = g.append("g").attr("class", "line-labels");

  // Hover: vertical rule + tooltip with the values for that month
  hoverG = g.append("g").attr("class", "hover").style("display", "none");
  hoverG.append("line").attr("y1", 0).attr("y2", plotH);
  g.append("rect")
    .attr("class", "hover-capture")
    .attr("width", innerW)
    .attr("height", plotH)
    .on("pointermove", onHover)
    .on("pointerleave", () => {
      hoverG.style("display", "none");
      hideTooltip();
    });

  // Brush track
  const brushY = plotH + 30;
  g.append("text").attr("class", "brush-hint").attr("x", 0).attr("y", brushY + BRUSH_H + 16)
    .text("Arrastra sobre la franja para elegir el periodo (se ajusta a años completos). Afecta al mapa.");
  gBrush = g.append("g").attr("class", "brush").attr("transform", `translate(0,${brushY})`);
  brush = d3
    .brushX()
    .extent([[0, 0], [innerW, BRUSH_H]])
    .on("end", onBrushEnd);
  gBrush.call(brush);
  gBrush.select(".overlay").attr("aria-label", "Selector de periodo");

  events.on("selection.timeline", update);
  events.on("period.timeline", drawPeriod);
  update();
  drawPeriod();
}

// Split a series into the consolidated part (solid) and 2026 (dashed). The
// dashed part starts at December 2025 so the two segments connect.
function splitSeries(rows) {
  const solid = rows.filter((d) => d.date < PRELIM_START);
  const dashed = rows.filter((d) => d.date >= new Date(Date.UTC(LAST_YEAR - 1, 11, 1)));
  return { solid, dashed };
}

function series() {
  const list = [{ key: "nacional", name: "Nacional", color: "#8a8a8a", rows: data.national, national: true }];
  for (const s of state.selected) {
    const info = data.cantons.get(s.code);
    list.push({ key: s.code, name: niceName(info.canton), color: colorOf(s.code), rows: data.monthlyByCanton.get(s.code) });
  }
  return list;
}

function update() {
  const list = series();
  const ymax = d3.max(list, (s) => d3.max(s.rows, (d) => d.rate3m)) || 1;
  y.domain([0, ymax * 1.05]).nice();
  yAxisG.transition().duration(400).call(d3.axisLeft(y).ticks(6));
  yAxisG.selectAll(".tick line").attr("x2", W - M.left - M.right).attr("class", "grid");

  const line = d3
    .line()
    .defined((d) => d.rate3m != null)
    .x((d) => x(d.date))
    .y((d) => y(d.rate3m));

  const parts = list.flatMap((s) => {
    const { solid, dashed } = splitSeries(s.rows);
    return [
      { ...s, id: `${s.key}-solid`, rows: solid, dashed: false },
      { ...s, id: `${s.key}-dashed`, rows: dashed, dashed: true },
    ];
  });

  gLines
    .selectAll("path")
    .data(parts, (d) => d.id)
    .join((enter) => enter.append("path").attr("d", (d) => line(d.rows)))
    .attr("class", (d) => (d.national ? "series series-national" : "series series-canton"))
    .attr("stroke", (d) => d.color)
    .attr("stroke-dasharray", (d) => (d.dashed ? "4 3" : null))
    .transition()
    .duration(400)
    .attr("d", (d) => line(d.rows));

  // Keep the national line under the canton lines
  gLines.selectAll("path.series-national").lower();

  drawLabels(list);
}

// Direct labels at the end of each line, nudged apart to avoid overlaps.
function drawLabels(list) {
  const items = list.map((s) => {
    const last = s.rows[s.rows.length - 1];
    return { ...s, y0: y(last.rate3m ?? 0), y: y(last.rate3m ?? 0) };
  });
  items.sort((a, b) => a.y0 - b.y0);
  const gap = 13;
  for (let i = 1; i < items.length; i++) {
    if (items[i].y - items[i - 1].y < gap) items[i].y = items[i - 1].y + gap;
  }
  const overflow = items.length ? items[items.length - 1].y - plotH : 0;
  if (overflow > 0) items.forEach((d) => (d.y -= overflow));

  gLabels
    .selectAll("text")
    .data(items, (d) => d.key)
    .join("text")
    .attr("x", x(X_END) + 6)
    .attr("dy", "0.35em")
    .attr("fill", (d) => (d.national ? "#555" : d.color))
    .attr("class", (d) => (d.national ? "line-label national" : "line-label"))
    .text((d) => d.name)
    .transition()
    .duration(400)
    .attr("y", (d) => d.y);
}

function onHover(event) {
  const [mx] = d3.pointer(event);
  const date = d3.utcMonth.round(x.invert(mx));
  const t = +d3.utcMonth.floor(date);
  hoverG.style("display", null).select("line").attr("x1", x(date)).attr("x2", x(date));

  const rows = series()
    .map((s) => ({ s, d: s.rows.find((r) => +r.date === t) }))
    .filter((r) => r.d);
  if (!rows.length) return;
  const prelim = t >= +PRELIM_START ? `<div class="tt-note">Dato preliminar (2026).</div>` : "";
  showTooltip(
    event,
    `<strong>${fmtMonth(new Date(t))}</strong>
     <div class="tt-sub">Tasa anualizada, 3 meses, por 100 mil hab.</div>
     <table>${rows
       .map(
         ({ s, d }) =>
           `<tr><td><span class="swatch" style="background:${s.color}"></span>${s.name}</td>
            <td>${d.rate3m == null ? "—" : fmtRate(d.rate3m)}</td>
            <td class="muted">${d.victims3m == null ? "" : `${d.victims3m} víct.`}</td></tr>`
       )
       .join("")}</table>${prelim}`
  );
  moveTooltip(event);
}

// Snap the brush to whole years and publish the period.
function onBrushEnd(event) {
  if (!event.sourceEvent) return; // ignore programmatic moves
  if (!event.selection) {
    // A click without dragging: select the clicked year
    const [mx] = d3.pointer(event.sourceEvent, gBrush.node());
    const yr = x.invert(mx).getUTCFullYear();
    setPeriod([yr, yr]);
    drawPeriod();
    return;
  }
  const [d0, d1] = event.selection.map(x.invert);
  const from = d3.utcYear.round(d0).getUTCFullYear();
  let to = d3.utcYear.round(d1).getUTCFullYear() - 1;
  if (d1 >= d3.utcYear.floor(X_END)) to = Math.max(to, LAST_YEAR); // reaching into 2026 counts
  setPeriod([from, Math.max(from, to)]);
  drawPeriod(); // re-snap even if the period did not change
}

function yearSpan([from, to]) {
  const a = new Date(Date.UTC(from, 0, 1));
  const b = to >= LAST_YEAR ? X_END : new Date(Date.UTC(to + 1, 0, 1));
  return [x(a), x(b)];
}

function drawPeriod() {
  const [a, b] = yearSpan(state.period);
  gPeriod.select("rect").attr("x", a).attr("width", b - a);
  gBrush.call(brush.move, [a, b]);
  const [from, to] = state.period;
  d3.select("#period-label").text(from === to ? `${from}` : `${from}–${to}`);
}
