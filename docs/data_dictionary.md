# Data dictionary

Working draft. Documents every cleaning decision; feeds the *Data and Methodology* section of the paper.

## Sources

| File | Coverage | Rows |
|---|---|---|
| `mdi_homicidiosintencionales_pm_2014_2025.xlsx` (sheet 2) | 2014-01-01 to 2025-12-31 | 39,821 |
| `mdi_homicidiosintencionales_pm_2026_enero_agosto.xlsx` (sheet 2) | 2026-01-01 to 2026-08-31 | 5,676 |
| `Tabulado_cantonal_2010-2035_rev2024.xlsx` (INEC, population projections rev. 2024) | 2010–2035, 30 June | 221 cantons |
| `cantones/cantones.shp` (INEC canton boundaries, EPSG:32717) | 2026 layer | 221 polygons |

Homicide files: one row = one victim; sheet 1 of each file is a metadata sheet. URLs and download dates are in `docs/sources.md`.

## Verification totals

Every transformation must preserve these counts.

| Year | Full year | Jan–Aug |
|---|---|---|
| 2014 | 1,310 | 919 |
| 2015 | 1,050 | 719 |
| 2016 | 959 | 659 |
| 2017 | 970 | 677 |
| 2018 | 996 | 668 |
| 2019 | 1,189 | 754 |
| 2020 | 1,371 | 823 |
| 2021 | 2,495 | 1,440 |
| 2022 | 4,886 | 2,968 |
| 2023 | 8,247 | 5,111 |
| 2024 | 7,065 | 4,374 |
| 2025 | 9,283 | 6,067 |
| 2026 | — (partial) | 5,676 |

2026 is partial and preliminary. It is only compared with the same months (Jan–Aug) of earlier years.

2026 by month: Jan 760, Feb 686, Mar 665, Apr 680, May 712, Jun 695, Jul 719, Aug 759.

## Differences between the 2014–2025 and 2026 files

Checked in `notebooks/02_comparar_bases.ipynb`.

| Aspect | Finding | Decision |
|---|---|---|
| Columns | Same 33 columns, same order | Concatenate directly |
| `edad` type | 2014–2025: all values read as text. 2026: integers mixed with `SIN_DATO` (163 rows) | Convert both with `pd.to_numeric(errors="coerce")`; `SIN_DATO` → missing |
| `area_hecho` | 2026 has 1 `SIN_DATO`; 2014–2025 has none | Treat as missing; report the count |
| `presun_motiva_observada` | 35 categories in 2014–2025, 26 in 2026. Absent in 2026: TRÁFICO INTERNACIONAL DE DROGA (325 cases in 2014–2025), LITIGIO DE BIENES (51), CONTRABANDO (22), ROBO A ENTIDADES FINANCIERAS (12), TRÁFICOS DE MIGRANTES (10), ROBO DE BIENES PATRIMONIALES (7), RECEPTACIÓN ILEGAL (CACHINERÍA) (3), TRATA DE PERSONAS (3), SIN_DATO (1) | Rare categories: expected absence in 8 months. TRÁFICO INTERNACIONAL DE DROGA: not explained by the dictionaries (see *Official data dictionaries*). No impact: merged into the `Drogas` group |
| `codigo_canton` | 216 cantons with cases in 2014–2025, 149 in 2026. The 67 absent cantons had 68 cases combined in 2025 (max. 9 in one canton) | Expected for small cantons. Fill with zeros when aggregating (true zero, not missing). Supports the low-population flag (R5) |
| Other variables (`tipo_muerte`, `arma`, `sexo`, `medida_edad`) | No new categories in 2026 | No action |

## Official data dictionaries

Two dictionaries published by the Ministerio del Interior: `dd_historica.xlsx` (MDI_HomicidiosIntencionales_PM_BBD_Historica) and `dd_2025.xlsx` (MDI_HomicidiosIntencionales_PM_2025). Both define the 33 fields and list categories in a `DD_CATEGORIAS` sheet. Category definitions for `arma`, `lugar` and `probable_causa_motivada` refer to the National Police *Manual de conceptualización de variables*.

The dictionaries are not a complete or exact list of the values in the data:

| Issue | Example | Decision |
|---|---|---|
| Categories removed from `dd_2025` but still used in 2025–2026 data | `arma`: SUSTANCIAS (1 case in 2025, 4 in 2026); motive: EVASIÓN DE LA JUSTICIA, VIOLACIÓN FAMILIAR DIRECTO | Use the values observed in the data as the reference; dictionaries are used only for definitions |
| Spelling differences between dictionary and data | FINANCEIRAS, TRAFICO INTERNOS, TRANSTORNOS, SICOPATOLOGIAS | Use the data spelling |
| `SIN_DATO` in `area_hecho` is not a dictionary category | 1 case in 2026 | Treat as missing |

**TRÁFICO INTERNACIONAL DE DROGA:** still listed in both dictionaries. Yearly cases: 3–10 (2014–2020), 59 (2021), 69 (2022), 94 (2023), 37 (2024), 24 (2025), 0 (Jan–Aug 2026). The dictionaries do not explain the 2026 absence; it may be a real decline or a recording change. No impact on the analysis: it is merged with microtráfico in the "drugs" group of `motivo_grupo`. Reported as a limitation.


## Pipeline

| Step | Script | Input | Output | Published |
|---|---|---|---|---|
| 1. Clean and merge victim records | `src/01_limpieza.py` | `data/raw/` (2 XLSX) | `data/interim/homicidios_limpio.csv` | **No** (one row per victim; `data/interim/` is git-ignored) |
| 2. Population by canton and year; code validation | `src/02_poblacion.py` | `data/external/` (INEC projections, boundaries) + step 1 output | `data/processed/poblacion_canton_anio.csv` | Yes (aggregate) |
| 3. Aggregates for the views | `src/03_agregados.py` | steps 1 and 2 outputs | `data/processed/canton_mes.csv`, `nacional_mes.csv`, `canton_anio.csv`, `canton_periodo.csv`, `perfil.csv` | Yes (aggregate) |
| 4. Web geometry | `src/04_geometrias.py` (runs mapshaper 0.6.102 via `npx`) | `data/external/cantones/` | `data/processed/cantones.topo.json` | Yes (boundaries, no victim data) |

Each script stops with `[FAIL]` if a verification does not pass, so later steps never run on inconsistent data.

## Cleaning steps (`src/01_limpieza.py`)

| # | Step | Verification |
|---|---|---|
| 1 | Read sheet 2 of both files and concatenate | Same 33 columns in both files |
| 2 | Replace `SIN_DATO` with missing in every column | — |
| 3 | Parse `fecha_infraccion` as a date | Every row has a valid date |
| 4 | Zero-pad codes: `codigo_provincia` to 2 digits, `codigo_canton` to 4 | Every canton code has 4 digits and starts with its province code |
| 5 | Convert `edad` to a number | `medida_edad` is always `A` (years), so no unit conversion is needed |
| 6 | Consistency check: `arma` vs. `probable_causa_motivada` | Firearm: 36,222 (`arma`) vs. 36,175 (firearm wound); difference 47 (0.13%) |
| 7 | Keep 11 of 33 columns (data minimization) | — |
| 8 | Create derived variables (see below) | Every `arma` and `presun_motiva_observada` category is mapped; the script stops if a new category appears |
| 9 | Check totals | 45,497 rows in and out; yearly totals equal the *Verification totals* table; 2026 ends in August |

### Dropped columns

| Columns | Reason |
|---|---|
| `coordenada_x`, `coordenada_y` | Never published (re-identification risk). Not needed: the unit of analysis is the canton. Dropping them also removes the coordinates recorded as `0` |
| `zona`, `subzona`, `distrito`, `circuito`, `subcircuito`, `codigo_subcircuito` | Police units without population data; the canton is the unit of analysis |
| `hora_infraccion`, `lugar`, `tipo_lugar` | Out of scope (future work) |
| `tipo_arma` | Too many categories; `arma` is enough for the profile view |
| `presunta_motivacion` | 80% of cases fall into "Delincuencia común"; not informative |
| `probable_causa_motivada` | Medical cause of death, not a motive. Used only for the consistency check (step 6) |
| `medida_edad` | Constant (always years) after step 5 |
| `genero`, `etnia`, `estado_civil`, `nacionalidad`, `discapacidad`, `profesion_registro_civil`, `instruccion` | Personal attributes not needed for any requirement (data minimization) |

## Cleaned dataset: `data/interim/homicidios_limpio.csv`

45,497 rows (one per victim), 17 columns. Internal use only.

| Column | Type | Description | Values |
|---|---|---|---|
| `codigo_provincia` | text (2) | DPA province code | `01`–`24` |
| `provincia` | text | Province name as in the source | |
| `codigo_canton` | text (4) | DPA canton code; join key | 216 codes with cases |
| `canton` | text | Canton name as in the source | |
| `fecha_infraccion` | date | Date of the fatal injury | 2014-01-01 to 2026-08-31 |
| `tipo_muerte` | text | Legal classification (COIP) | ASESINATO 40,659; HOMICIDIO 3,639; FEMICIDIO 911; SICARIATO 288 |
| `area_hecho` | text | Urban or rural | URBANO 34,855; RURAL 10,641; missing 1 |
| `arma` | text | Weapon (source categories) | 6 categories |
| `presun_motiva_observada` | text | Presumed motive, as recorded by the police | 34 categories + 1 missing |
| `edad` | number | Age in years | 0–98; missing 1,044 |
| `sexo` | text | Sex | HOMBRE 41,062; MUJER 4,242; NO DETERMINADO 193 |
| `anio` | integer | Year of `fecha_infraccion` | 2014–2026 |
| `mes` | integer | Month of `fecha_infraccion` | 1–12 |
| `anio_mes` | text | Year-month, `YYYY-MM` | 152 months |
| `arma_grupo` | text | Grouped weapon | see below |
| `motivo_grupo` | text | Grouped presumed motive | see below |
| `grupo_edad` | text | Age group | see below |

## Derived groupings (confirmed 2026-10-26)

Category names are matched after removing accents and upper-casing, so spelling variants between files map to the same group. Counts are for the full data (2014 to Aug 2026, 45,497 victims).

### `arma_grupo`

| Group | Source categories | Victims |
|---|---|---|
| Fuego | ARMA DE FUEGO | 36,222 (79.6%) |
| Blanca | ARMA BLANCA | 5,626 (12.4%) |
| Otra | ARMA CONTUNDENTE, CONSTRICTORA, OTROS, SUSTANCIAS | 3,649 (8.0%) |

### `motivo_grupo` (always labeled "presumed (police)")

| Group | Source categories | Victims |
|---|---|---|
| Amenaza | AMENAZA | 21,891 (48.1%) |
| Drogas | TRÁFICO INTERNO DE DROGAS (MICROTRÁFICO), TRÁFICO INTERNACIONAL DE DROGA | 11,855 (26.1%) |
| Riñas | RIÑAS | 3,995 (8.8%) |
| Robo | ROBO A PERSONAS, ROBO A DOMICILIOS, ROBO DE CARROS, ROBO DE MOTOS, ROBO EN EJES VIALES O CARRETERAS, ROBO A UNIDADES ECONÓMICAS, ROBO A ENTIDADES FINANCIERAS, ROBO DE BIENES PATRIMONIALES, ABIGEATO | 3,738 (8.2%) |
| Interpersonal | SENTIMENTAL, EMOCIONAL, MALTRATO, DEUDAS, LITIGIO DE TIERRAS, LITIGIO DE BIENES | 2,684 (5.9%) |
| Otros | ACTOS DE ODIO, LINCHAMIENTO, SECUESTRO, SECUESTRO EXPRESS, TERRORISMO, DEFENSA PROPIA, VIOLACIÓN SEXUAL (DESCONOCIDO), VIOLACIÓN FAMILIAR DIRECTO (PERSONA CONOCIDA), TRASTORNOS MENTALES, EVASIÓN DE LA JUSTICIA, CONTRABANDO, TRÁFICOS DE MIGRANTES, TRÁFICO DE ARMAS, TRATA DE PERSONAS, RECEPTACIÓN ILEGAL (CACHINERÍA) | 1,333 (2.9%) |
| *(missing)* | SIN_DATO | 1 |

Rationale: groups follow the police categories' meaning and keep each group large enough to compare cantons. AMENAZA is kept alone because it is the largest category and has no definition in the dictionaries (limitation). ACTOS DE ODIO (675) stays in Otros because no requirement needs it separately.

### `grupo_edad`

| Group | Victims |
|---|---|
| 0–17 | 2,504 |
| 18–24 | 9,838 |
| 25–34 | 15,876 |
| 35–44 | 9,184 |
| 45–59 | 5,291 |
| 60+ | 1,760 |
| *(missing)* | 1,044 |

Under-12s (414) are merged with 12–17 because separately they would be near zero in most cantons.

## Missing values

Encoded three ways in the source: `NaN`, the string `SIN_DATO`, and `0` in coordinates. A naive `isna()` reports 0% missing. After cleaning (coordinates dropped, `SIN_DATO` → missing):

| Column | Missing |
|---|---|
| `edad`, `grupo_edad` | 1,044 (2.3%) |
| `area_hecho` | 1 |
| `presun_motiva_observada`, `motivo_grupo` | 1 |
| All other columns | 0 |

## Population: `data/processed/poblacion_canton_anio.csv`

Source: INEC, *Estimaciones y Proyecciones de Población, revisión 2024* (based on the 2022 Census), table `Tabulado_cantonal_2010-2035_rev2024.xlsx`. Values as of 30 June of each year. 221 cantons × 13 years (2014–2026) = 2,873 rows.

| Column | Type | Description |
|---|---|---|
| `codigo_canton` | text (4) | DPA canton code (from the boundary layer) |
| `canton` | text | Canton name as in the boundary layer |
| `codigo_provincia` | text (2) | DPA province code |
| `anio` | integer | Year |
| `poblacion` | integer | Projected population at 30 June |

**How codes are attached:** the INEC table has names only. Each sheet is one province (province code assigned by sheet, in DPA order); cantons are matched to the boundary layer by province code + accent-free name. All 221 match exactly one polygon; no manual aliases were needed.

**Verifications (`src/02_poblacion.py`):** 24 province sheets; 221 cantons; cantons add up to the province totals every year; 221 unique codes in the boundary layer; one-to-one match; all 216 homicide canton codes have population; every value is positive. National population (sum of cantons): 15,994,366 (2014) to 18,243,816 (2026).

**True zeros:** 5 cantons have no recorded homicides in 2014–Aug 2026: Oña (`0110`), Marcabelí (`0708`), Yacuambi (`1904`), San Cristóbal (`2001`), Isabela (`2002`). They get 0, not missing, when aggregating.

**Note:** the projection for 2022 (17,715,301) is 4.6% above the 2022 Census count (16,938,986), presumably because of INEC's adjustment for census omission (to confirm in the methodology). The projection is used for every year, so rates are comparable over time.

## Aggregates for the views (`src/03_agregados.py`)

Parameters: rate per 100,000; 2026 counts 8 months; trailing 3-month window; unstable-rate threshold = fewer than 20 victims; periods base 2014–2018 and recent 2021–2026.

**Person-years.** For each canton-year, `persona_anios = poblacion × meses / 12` (12 months, or 8 for 2026). A rate over any set of years is `sum(victimas) / sum(persona_anios) × 100,000`, so partial 2026 is comparable with full years. The browser applies the same formula to the brushed years.

| File | Rows | Columns | View |
|---|---|---|---|
| `canton_mes.csv` | 33,592 (221 × 152 months) | `codigo_canton`, `anio_mes`, `anio`, `mes`, `victimas`, `victimas_3m`, `poblacion`, `tasa_3m` | V2 |
| `nacional_mes.csv` | 152 | same, without `codigo_canton` | V2 |
| `canton_anio.csv` | 2,873 (221 × 13) | `codigo_canton`, `canton`, `codigo_provincia`, `anio`, `meses`, `victimas`, `poblacion`, `persona_anios`, `tasa` | V1, V3 |
| `canton_periodo.csv` | 221 | `victimas_*`, `persona_anios_*`, `tasa_*`, `bajo_conteo_*` for `base` and `reciente`; `cambio_abs`, `cambio_ratio` | V1, V3 |
| `perfil.csv` | 18,442 (non-zero cells) | `codigo_canton`, `anio`, `variable`, `categoria`, `victimas` | V4 |

- **True zeros:** `canton_mes` and `canton_anio` include every canton and period, with 0 where there are no victims.
- **`victimas_3m`, `tasa_3m`:** victims in the current and two previous months; rate annualized (× 12/3) with the population of the current month's year. Empty for January and February 2014 (incomplete window).
- **`bajo_conteo_*`:** `True` when the period has fewer than 20 victims (unstable rate, R5).
- **`cambio_ratio`:** empty when the base rate is 0 (undefined), never infinite.
- **`perfil.csv`:** variables `arma_grupo`, `grupo_edad`, `motivo_grupo`, `area_hecho`. Missing values are kept as the category `Sin dato`, so each variable adds up to 45,497. Proportions in V4 should exclude `Sin dato` and say so.

**Verifications:** every file keeps 45,497 victims; complete grids (221 × 152, 221 × 13); yearly and period totals (base 5,285; recent 37,652) match the cleaned data; each profile variable adds up to all victims.

## Geometry: `data/processed/cantones.topo.json`

TopoJSON, EPSG:4326, two objects: `continente` (218 cantons) and `galapagos` (3 cantons, province `20`, drawn in an inset). Properties: `codigo_canton`, `canton`. 204 KB.

mapshaper steps: `-clean` (repairs 21,644 intersections and 14,663 gaps/overlaps in the source layer) → `-proj wgs84` → keep and rename `code`, `name_es` → `-simplify 5% weighted keep-shapes` → `-clean` → split by region → TopoJSON, quantization 1e5.

**Verifications:** < 1 MB; 218 + 3 cantons; Galápagos layer has only province `20`; codes equal the 221 codes of the population file; no empty geometry; per-canton area change vs. the original layer: median 0.09%, max 1.41% (Suscal).

## Pending

- [X] Compare `dd_2025` and `dd_historica` definitions (especially drug-related motive categories).
- [x] Close the `motivo_grupo` mapping.
- [x] Unstable-rate flag: fewer than 20 victims in the selected period (count-based; replaces the population threshold).
- [x] Monthly rate: trailing 3-month window, annualized.
- [ ] Optional: validate codes against the 2026 geographic classifier.
