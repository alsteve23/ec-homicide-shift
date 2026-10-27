// Data loading and the small aggregations the browser has to do.
// Everything heavy is precomputed in Python (src/03_agregados.py); here we
// only parse the CSVs and sum annual counts over the brushed years.

const PER_100K = 100000;

// Explicit row parsers: d3.autoType would turn "0101" into 101.
const num = (v) => (v === "" || v == null ? null : +v);
const parseMonth = d3.utcParse("%Y-%m");

function parseAnnual(d) {
  return {
    code: d.codigo_canton,
    canton: d.canton,
    province: d.codigo_provincia,
    year: +d.anio,
    months: +d.meses,
    victims: +d.victimas,
    population: +d.poblacion,
    personYears: +d.persona_anios,
  };
}

function parseMonthly(d) {
  return {
    code: d.codigo_canton, // undefined in the national file
    date: parseMonth(d.anio_mes),
    year: +d.anio,
    victims: +d.victimas,
    victims3m: num(d.victimas_3m),
    population: +d.poblacion,
    rate3m: num(d.tasa_3m), // annualized 3-month rate per 100k (null for the first 2 months)
  };
}

export async function loadData() {
  const t0 = performance.now();
  const [topo, annual, monthly, national] = await Promise.all([
    d3.json("data/cantones.topo.json"),
    d3.csv("data/canton_anio.csv", parseAnnual),
    d3.csv("data/canton_mes.csv", parseMonthly),
    d3.csv("data/nacional_mes.csv", parseMonthly),
  ]);

  const cantons = new Map(); // code -> { code, canton, province }
  for (const d of annual) {
    if (!cantons.has(d.code)) cantons.set(d.code, { code: d.code, canton: d.canton, province: d.province });
  }

  const data = {
    topo,
    cantons,
    annualByCanton: d3.group(annual, (d) => d.code),
    monthlyByCanton: d3.group(monthly, (d) => d.code),
    national,
    // National annual totals, used for the tooltip context line
    nationalAnnual: d3.rollup(
      annual,
      (v) => ({ victims: d3.sum(v, (d) => d.victims), personYears: d3.sum(v, (d) => d.personYears) }),
      (d) => d.year
    ),
  };
  console.info(`[perf] data loaded and parsed in ${(performance.now() - t0).toFixed(0)} ms`);
  return data;
}

// Rate over a period = sum(victims) / sum(person-years) * 100k.
// Person-years already account for the 8 months of 2026, so partial years are
// weighted correctly.
export function periodStats(rows, [from, to]) {
  let victims = 0;
  let personYears = 0;
  let population = null;
  for (const d of rows) {
    if (d.year < from || d.year > to) continue;
    victims += d.victims;
    personYears += d.personYears;
    if (d.year === to) population = d.population;
  }
  return {
    victims,
    personYears,
    population, // population in the last year of the period
    rate: personYears > 0 ? (victims / personYears) * PER_100K : null,
  };
}

export function nationalPeriodStats(data, [from, to]) {
  let victims = 0;
  let personYears = 0;
  for (const [year, v] of data.nationalAnnual) {
    if (year < from || year > to) continue;
    victims += v.victims;
    personYears += v.personYears;
  }
  return { victims, personYears, rate: (victims / personYears) * PER_100K };
}
