# Paper notes

Running log of facts, decisions and limitations that should appear in the paper. Organized by paper section.

Each note: the fact with exact figures, the evidence (where it comes from), the status (**demonstrated**, **assumption** or **pending**), and, when relevant, the requirement (R1–R5) and the Munzner level. Aggregate figures only.

Unless stated otherwise, "full data" = 2014-01-01 to 2026-08-31 (45,497 victims); "base period" = 2014–2018 (5,285 victims); "recent period" = 2021 to Aug 2026 (37,652 victims).

---

## Introduction / Problem

- **Scale of the increase.** Intentional homicide victims per year: 1,310 (2014), 1,050 (2015), 959 (2016), 970 (2017), 996 (2018), 1,189 (2019), 1,371 (2020), 2,495 (2021), 4,886 (2022), 8,247 (2023), 7,065 (2024), 9,283 (2025). Roughly 9× between the 2014–2018 average (~1,057) and 2025.
  Evidence: `notebooks/01_perfilado_datos.ipynb`. Status: demonstrated. (2026-10-26)
- **Firearms became dominant.** Share of victims killed with a firearm: 50.3% in the base period (2,656 / 5,285) vs. 85.3% in the recent period (32,107 / 37,652).
  Evidence: crosstab `arma` × period, 2026-10-26 session. Status: demonstrated; re-check after cleaning. Relevant to R4.
- **Presumed drug-related motive grew.** Micro-trafficking + international drug trafficking: 6.3% of victims in the base period (332) vs. 29.7% in the recent period (11,170).
  Evidence: crosstab `presun_motiva_observada` × period. Status: demonstrated; motive is a police presumption. Relevant to R4.

- **National rate rose almost six-fold:** 6.4 victims per 100,000 inhabitants per year in the base period (2014–2018) vs. 37.1 in the recent period (2021–Aug 2026), using person-years as denominator (2026 counted as 8/12 of a year). Evidence: `src/03_agregados.py`. Status: demonstrated. (2026-10-27)
- **Largest increases are concentrated in coastal cantons (preliminary, tables only):** among the 56 cantons with ≥ 20 victims in both periods, the largest absolute increases in the rate per 100k are Puebloviejo (12.1 → 190.6), La Troncal (13.4 → 122.2), Huaquillas (17.2 → 125.6), Durán (6.1 → 103.5) and Naranjal (14.9 → 111.5). Evidence: `src/03_agregados.py`, section 6. Status: demonstrated as computed; the "coastal" reading is an observation to confirm on the map. Write neutrally (avoid stigmatizing places). Relevant to R2. (2026-10-27)

## Data and Methodology

### Sources
- Ministerio del Interior, *Homicidios Intencionales* open data (datosabiertos.gob.ec): 2014–2025 file (39,821 rows) and Jan–Aug 2026 file (5,676 rows). One row = one victim, 33 columns. Both published 18 Sep 2026; metadata note says records are subject to updates.
- Official data dictionaries: `MDI_HomicidiosIntencionales_PM_BBD_Historica` and `MDI_HomicidiosIntencionales_PM_2025`. Some definitions refer to the National Police *Manual de conceptualización de variables*.
- INEC canton boundaries (221 polygons, EPSG:32717). The 2026 geographic classifier: pending.
- **Population denominator:** INEC *Estimaciones y Proyecciones de Población, revisión 2024* (based on the 2022 Census), canton-level totals 2010–2035, values as of 30 June of each year. 221 cantons, the same number as the boundary layer. The table identifies cantons by name only (no DPA codes), so the join requires a name-to-code step. National total for 2026: 18,243,816. Evidence: `data/external/Tabulado_cantonal_2010-2035_rev2024.xlsx`. Status: demonstrated. (2026-10-26)
- **Canton codes are consistent across the three sources:** the population table has names only; codes are attached by matching province code + accent-free canton name to the INEC boundary layer. All 221 population cantons match exactly one polygon (no manual aliases needed, since both INEC products share the same names); all 216 homicide canton codes have population; cantons add up to their province totals every year. The 5 cantons with no recorded homicides (2014–Aug 2026) are Oña, Marcabelí, Yacuambi, San Cristóbal and Isabela (true zeros). Evidence: `src/02_poblacion.py`. Status: demonstrated; validation against the 2026 geographic classifier still pending. Munzner: data abstraction. Relevant to R5. (2026-10-26)
- **Projected vs. census population:** the rev. 2024 projection for 2022 (17,715,301) is 4.6% higher than the 2022 Census count (16,938,986). Presumably reflects INEC's adjustment for census omission (see the rev. 2024 methodology and *Conciliación demográfica*). Status: figures demonstrated; reason is an assumption to confirm in the methodology. Rates use the projection, consistently for all years. (2026-10-26)
- **Boundary layer needed topological cleaning:** the INEC canton layer has 21,644 geometry intersections and 14,663 slivers (small gaps/overlaps between neighbouring cantons, threshold ≈ 0.04 km²). They are repaired with mapshaper `-clean` before simplification so shared borders stay consistent. Evidence: `src/04_geometrias.py` / mapshaper output. Status: demonstrated. (2026-10-27)
- **Many small cantons:** 89 of 221 cantons (40%) have fewer than 20,000 inhabitants in 2026. Rates there are unstable; motivates the low-population flag (R5). Threshold still to be decided. Status: demonstrated. (2026-10-26)
- **Small counts are the real source of rate instability, more than population size:** in the base period (2014–2018) 165 of 221 cantons have fewer than 20 victims; in the recent period (2021–Aug 2026), 111. A population threshold of 20,000 and a count threshold of 20 victims disagree on 38 cantons: 30 cantons with ≥ 20,000 inhabitants have < 20 recent victims, and 8 cantons with < 20,000 inhabitants have ≥ 20. Cantons under 20,000 hold 5.2% of the population and 2.0% of victims. Reference: rates based on fewer than 20 events are commonly flagged as unreliable (US NCHS convention; relative standard error > 23%) — citation to verify. Evidence: exploration 2026-10-27 on `homicidios_limpio.csv` + `poblacion_canton_anio.csv`. Status: figures demonstrated. **Decision (2026-10-27): a rate is flagged as unstable when it rests on fewer than 20 victims in the selected period** (count-based, recomputed when the brush changes), instead of a fixed population threshold. Munzner: data abstraction / encoding. Relevant to R2, R5 (and to V3, since base-period rates rest on small counts for most cantons). (2026-10-27)
- **Monthly canton series are sparse:** only 26.7% of canton-months (8,953 of 33,592) have at least one victim; national monthly counts range from 56 to 935. Motivates smoothing the monthly canton series in V2. **Decision (2026-10-27): monthly rate = victims in the trailing 3-month window (current + 2 previous months), annualized (× 4), per 100k, with the population of the current month's year.** Keeps monthly resolution to answer "when did the escalation start"; instability is shown with the < 20 victims flag rather than hidden by heavier smoothing. Status: demonstrated (implemented in `src/03_agregados.py`). Relevant to R1, R5. (2026-10-27)

### Data quality findings
- **Missing values are encoded three ways:** `NaN`, the string `SIN_DATO`, and `0` in coordinates (~1,567 rows). A naive `isna()` reports 0% missing. Status: demonstrated.
- **Leading zeros lost:** province and canton codes are read as integers (`901` instead of `0901`); they must be zero-padded to 2 and 4 digits before joining. Status: demonstrated.
- **Type mismatch between files:** `edad` is read as text in 2014–2025 and as integers mixed with `SIN_DATO` (163 rows) in 2026. Status: demonstrated.
- **The dictionaries are not an exact list of the values in the data:** `dd_2025` omits categories still used in 2025–2026 (e.g. `arma` = SUSTANCIAS: 1 case in 2025, 4 in 2026) and spells several categories differently from the data. Decision: observed values are the reference; dictionaries are used only for definitions. Status: demonstrated.
- **Spatial join is complete:** every canton code in the homicide data matches a polygon in the INEC layer; 5 polygons have no cases (true zeros). Status: demonstrated (before validation against the 2026 classifier).
- **Sparse cantons:** 216 cantons have at least one case in 2014–2025, but only 149 in Jan–Aug 2026. The 67 cantons with no 2026 cases had 68 cases combined in 2025 (max. 9 in one canton). Motivates the low-population flag and R5. Status: demonstrated.
- **Consistency check between weapon and medical cause:** 36,222 victims with `arma` = firearm vs. 36,175 with `probable_causa_motivada` = firearm wound (difference 47, 0.13%), full data. The two independently recorded fields agree closely. Evidence: `src/01_limpieza.py`. Status: demonstrated. (2026-10-26)
- **Cleaning preserves every record:** 45,497 rows in and out; annual totals 2014–2025 and the Jan–Aug 2026 total match the source exactly; every row has a valid date; every canton code has 4 digits and starts with its province code; each canton code maps to a single canton name; age is always recorded in years. Missing after cleaning: age 1,044 (2.3%), `area_hecho` 1, motive 1. Evidence: `src/01_limpieza.py`. Status: demonstrated. (2026-10-26)

### Decisions
- **Unit of analysis: canton**, because population denominators exist only at canton level (not for police circuits). Munzner: data abstraction.
- **Periods:** base 2014–2018 vs. recent 2021–2026. 2026 is partial (Jan–Aug) and preliminary: compared only with the same months of earlier years. Jan–Aug verification totals: 919, 719, 659, 677, 668, 754, 823, 1,440, 2,968, 5,111, 4,374, 6,067 (2014–2025); 5,676 (2026). Relevant to R5.
- **Data minimization:** the cleaned file keeps 11 of the 33 source columns (plus 6 derived). Coordinates, police circuit fields, time, place, ethnicity, marital status, nationality, disability, occupation, education and gender identity are dropped; coordinates are never published; only canton-level aggregates are released.
- **Groupings (confirmed 2026-10-26; implemented in `src/01_limpieza.py`):**
  - `motivo_grupo`: Threat 48.1%, Drugs 26.1%, Fights 8.8%, Robbery 8.2%, Interpersonal 5.9%, Other 2.9% (full data).
  - `arma_grupo`: Firearm 79.6%, Knife 12.4%, Other 8.0%.
  - `grupo_edad`: 0–17 (2,504), 18–24 (9,838), 25–34 (15,876), 35–44 (9,184), 45–59 (5,291), 60+ (1,760), missing 1,044. Minors grouped because under-12s (414) would be near zero in small cantons.
  Munzner: data abstraction. Relevant to R4.

## Requirements and Design

_(to be filled from week 3)_

## Implementation

- **Web geometry:** reprojected EPSG:32717 → EPSG:4326, simplified to 5% of vertices (Visvalingam, weighted; `keep-shapes`), TopoJSON with quantization 1e5, split into two objects (218 mainland cantons, 3 Galápagos cantons for the inset). File size 204 KB (source shapefile 9.4 MB). Per-canton area change vs. the original: median 0.09%, max 1.41% (Suscal). mapshaper 0.6.102. Evidence: `src/04_geometrias.py`. Status: demonstrated. Munzner: algorithm level (load time). (2026-10-27)

## Evaluation

_(to be filled in week 5)_

## Limitations

- **Motive is a police presumption,** recorded at investigation time, not a judicial finding.
- **"Threat" (AMENAZA) is vague and dominant:** 48.1% of all victims and 53.5% in the recent period (vs. 20.2% in the base period), with no definition in the dictionaries. Limits how much the motive profile can say.
- **International drug trafficking disappears in 2026:** 3–10 cases/year (2014–2020), 59 (2021), 69 (2022), 94 (2023), 37 (2024), 24 (2025), 0 (Jan–Aug 2026). Still a valid category in both dictionaries; cannot tell a real decline from a recording change. No effect on the "Drugs" group.
- **2026 data are partial and preliminary;** the source warns that records may be updated.
- **Incomplete dictionaries** (see Data quality findings).
- **Canton layer metadata are almost empty.**
