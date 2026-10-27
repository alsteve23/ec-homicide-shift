// Shared application state.
// Views never talk to each other: they call the setters below and listen to
// the events emitted through `events` (d3.dispatch).
//
// Events:
//   "selection" -> selected cantons changed      (payload: state.selected)
//   "period"    -> brushed period changed        (payload: state.period)
//   "metric"    -> map metric changed            (payload: state.metric)

export const FIRST_YEAR = 2014;
export const LAST_YEAR = 2026; // partial: January-August (preliminary)
export const LAST_MONTH = 8;
export const MAX_SELECTED = 5;
export const MIN_CASES = 20; // fewer victims in the period -> unstable rate (R5)

// Okabe-Ito colors, assigned in order to selection slots (black and yellow
// are left out: black is the outline color and yellow has poor contrast on white).
export const SELECTION_COLORS = ["#E69F00", "#0072B2", "#009E73", "#CC79A7", "#D55E00"];

export const BASE_PERIOD = [2014, 2018];
export const RECENT_PERIOD = [2021, 2026];

export const state = {
  // Each item: { code, slot }. The slot fixes the color while the canton
  // stays selected, so removing one canton never recolors the others.
  selected: [],
  period: [...RECENT_PERIOD], // inclusive years [from, to]
  metric: "tasa", // "tasa" (sequential); "cambio" is added in week 4
};

export const events = d3.dispatch("selection", "period", "metric");

export function isSelected(code) {
  return state.selected.some((d) => d.code === code);
}

export function colorOf(code) {
  const item = state.selected.find((d) => d.code === code);
  return item ? SELECTION_COLORS[item.slot] : null;
}

// Returns false when the selection is full and the canton could not be added.
export function toggleCanton(code) {
  if (isSelected(code)) {
    removeCanton(code);
    return true;
  }
  if (state.selected.length >= MAX_SELECTED) return false;
  const used = new Set(state.selected.map((d) => d.slot));
  const slot = d3.range(MAX_SELECTED).find((s) => !used.has(s));
  state.selected = [...state.selected, { code, slot }];
  events.call("selection", null, state.selected);
  return true;
}

export function removeCanton(code) {
  state.selected = state.selected.filter((d) => d.code !== code);
  events.call("selection", null, state.selected);
}

export function clearSelection() {
  state.selected = [];
  events.call("selection", null, state.selected);
}

export function setPeriod([from, to]) {
  from = Math.max(FIRST_YEAR, Math.min(from, LAST_YEAR));
  to = Math.max(from, Math.min(to, LAST_YEAR));
  if (from === state.period[0] && to === state.period[1]) return;
  state.period = [from, to];
  events.call("period", null, state.period);
}

export function setMetric(metric) {
  if (metric === state.metric) return;
  state.metric = metric;
  events.call("metric", null, state.metric);
}
