// Entry point: load the data once, then start every view.
import { loadData } from "./data.js";
import { state, events, removeCanton, clearSelection, colorOf, MAX_SELECTED } from "./state.js";
import { initMap } from "./views/map.js";
import { initTimeline } from "./views/timeline.js";
import { niceName } from "./tooltip.js";

const t0 = performance.now();

loadData()
  .then((data) => {
    initMap("#map", data);
    initTimeline("#timeline", data);
    initSelectionBar(data);
    d3.select("#loading").remove();
    console.info(`[perf] first render ${(performance.now() - t0).toFixed(0)} ms after start`);
  })
  .catch((err) => {
    console.error(err);
    d3.select("#loading").text("No se pudieron cargar los datos. Ejecuta la página con un servidor local (python -m http.server).");
  });

// Selection chips: name + color swatch + remove button (the canton is
// identified by text, never by color alone).
function initSelectionBar(data) {
  const bar = d3.select("#selection-chips");
  d3.select("#clear-selection").on("click", clearSelection);

  function render() {
    const items = state.selected.map((s) => ({ ...s, info: data.cantons.get(s.code) }));
    bar
      .selectAll("li")
      .data(items, (d) => d.code)
      .join((enter) => {
        const li = enter.append("li").attr("class", "chip");
        li.append("span").attr("class", "swatch");
        li.append("span").attr("class", "chip-name");
        li.append("button").attr("type", "button").attr("class", "chip-remove").text("×");
        return li;
      })
      .call((li) => {
        li.select(".swatch").style("background", (d) => colorOf(d.code));
        li.select(".chip-name").text((d) => niceName(d.info.canton));
        li.select(".chip-remove")
          .attr("aria-label", (d) => `Quitar ${niceName(d.info.canton)}`)
          .on("click", (_, d) => removeCanton(d.code));
      });
    d3.select("#selection-empty").style("display", items.length ? "none" : null);
    d3.select("#clear-selection").property("disabled", !items.length);
    d3.select("#selection-count").text(`${items.length}/${MAX_SELECTED}`);
  }

  events.on("selection.bar", render);
  render();
}
