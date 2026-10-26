# Data dictionary

Working draft. Documents every cleaning decision; feeds the *Data and Methodology* section of the paper.

## Sources

| File | Coverage | Rows |
|---|---|---|
| `mdi_homicidiosintencionales_pm_2014_2025.xlsx` (sheet 2) | 2014-01-01 to 2025-12-31 | 39,821 |
| `mdi_homicidiosintencionales_pm_2026_enero_agosto.xlsx` (sheet 2) | 2026-01-01 to 2026-08-31 | 5,676 |

One row = one victim. Sheet 1 of each file is a metadata sheet.

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
| `presun_motiva_observada` | 35 categories in 2014–2025, 26 in 2026. Absent in 2026: TRÁFICO INTERNACIONAL DE DROGA (325 cases in 2014–2025), LITIGIO DE BIENES (51), CONTRABANDO (22), ROBO A ENTIDADES FINANCIERAS (12), TRÁFICOS DE MIGRANTES (10), ROBO DE BIENES PATRIMONIALES (7), RECEPTACIÓN ILEGAL (CACHINERÍA) (3), TRATA DE PERSONAS (3), SIN_DATO (1) | Rare categories: expected absence in 8 months. TRÁFICO INTERNACIONAL DE DROGA: **pending** — check `dd_2025` for a possible reclassification. Impact is limited because it is merged into the "drugs" group |
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

## Missing values

Encoded three ways: `NaN`, the string `SIN_DATO`, and `0` in coordinates. All are converted to missing in `src/01_limpieza.py`.

## Pending

- [X] Compare `dd_2025` and `dd_historica` definitions (especially drug-related motive categories).
- [ ] Close the `motivo_grupo` mapping.
- [ ] Define the low-population threshold.
