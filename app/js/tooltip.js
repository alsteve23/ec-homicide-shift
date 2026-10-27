// One tooltip element shared by all views.

const tip = d3.select("body").append("div").attr("class", "tooltip").attr("role", "status").style("opacity", 0);

export function showTooltip(event, html) {
  tip.html(html).style("opacity", 1);
  moveTooltip(event);
}

export function moveTooltip(event) {
  const node = tip.node();
  const pad = 14;
  const { innerWidth: W, innerHeight: H } = window;
  const w = node.offsetWidth;
  const h = node.offsetHeight;
  let x = event.clientX + pad;
  let y = event.clientY + pad;
  if (x + w > W - 8) x = event.clientX - w - pad; // flip to the left near the edge
  if (y + h > H - 8) y = event.clientY - h - pad;
  tip.style("left", `${Math.max(8, x)}px`).style("top", `${Math.max(8, y)}px`);
}

export function hideTooltip() {
  tip.style("opacity", 0);
}

// Number formats (Spanish conventions: thousands with ".", decimals with ",")
const es = d3.formatLocale({ decimal: ",", thousands: ".", grouping: [3], currency: ["$", ""] });
export const fmtInt = es.format(",d");
export const fmtRate = es.format(",.1f");
export const fmtMonth = d3.timeFormatLocale({
  dateTime: "%A, %e de %B de %Y, %X",
  date: "%d/%m/%Y",
  time: "%H:%M:%S",
  periods: ["AM", "PM"],
  days: ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"],
  shortDays: ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"],
  months: ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
  shortMonths: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
}).utcFormat("%b %Y");

// Canton names come in upper case from the source; title-case them for display.
const LOWER = new Set(["de", "del", "la", "las", "los", "y", "el"]);
export function niceName(name) {
  return name
    .toLowerCase()
    .split(" ")
    .map((w, i) => (i > 0 && LOWER.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}
