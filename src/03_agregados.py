"""
03_agregados.py
Build the aggregate files consumed by the D3 views.

Input:  data/interim/homicidios_limpio.csv        (from 01_limpieza.py)
        data/processed/poblacion_canton_anio.csv  (from 02_poblacion.py)
Output (data/processed/, aggregate data, safe to publish):
        canton_mes.csv      canton x month, counts + 3-month annualized rate   (V2)
        nacional_mes.csv    national x month, same columns                     (V2)
        canton_anio.csv     canton x year, counts + person-years + rate        (V1, V3)
        canton_periodo.csv  canton x period (base / recent), rates and change  (V1, V3)
        perfil.csv          canton x year x variable x category, counts        (V4)

Run from anywhere:  python src/03_agregados.py
"""

import sys
from pathlib import Path

import pandas as pd

# ---------------------------------------------------------------------------
# Paths and parameters
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parents[1]
HOM_FILE = ROOT / "data" / "interim" / "homicidios_limpio.csv"
POP_FILE = ROOT / "data" / "processed" / "poblacion_canton_anio.csv"
OUT = ROOT / "data" / "processed"

PER_100K = 100_000
LAST_YEAR, LAST_MONTH = 2026, 8          # 2026 is partial (Jan-Aug)
WINDOW = 3                               # months in the moving window (V2)
MIN_CASES = 20                           # fewer cases -> unstable rate (R5)
PERIODS = {"base": (2014, 2018), "reciente": (2021, 2026)}
PROFILE_VARS = ["arma_grupo", "grupo_edad", "motivo_grupo", "area_hecho"]
MISSING_LABEL = "Sin dato"


def check(condition: bool, message: str) -> None:
    """Stop the pipeline if a verification fails."""
    if not condition:
        sys.exit(f"[FAIL] {message}")
    print(f"[ok]   {message}")


def save(df: pd.DataFrame, name: str) -> None:
    df.to_csv(OUT / name, index=False, encoding="utf-8", lineterminator="\n")
    print(f"       saved data/processed/{name} ({len(df):,} rows)")


# ---------------------------------------------------------------------------
# 0. Load
# ---------------------------------------------------------------------------
hom = pd.read_csv(HOM_FILE, dtype={"codigo_canton": str, "codigo_provincia": str})
pop = pd.read_csv(POP_FILE, dtype={"codigo_canton": str, "codigo_provincia": str})
N = len(hom)
cantons = pop[["codigo_canton", "canton", "codigo_provincia"]].drop_duplicates()
check(len(cantons) == 221, "221 cantons in the population file")

# Months covered by each year (2026 = 8): person-years for partial years
pop["meses"] = 12
pop.loc[pop["anio"] == LAST_YEAR, "meses"] = LAST_MONTH
pop["persona_anios"] = pop["poblacion"] * pop["meses"] / 12

# Full month grid 2014-01 ... 2026-08
months = pd.period_range("2014-01", f"{LAST_YEAR}-{LAST_MONTH:02d}", freq="M")
check(len(months) == 152, "152 months in the study period")

# ---------------------------------------------------------------------------
# 1. canton_mes.csv / nacional_mes.csv  (V2, R1)
#    Rate = cases in the last 3 months (current + 2 previous), annualized,
#    per 100k, using the population of the current month's year.
# ---------------------------------------------------------------------------
grid = pd.MultiIndex.from_product(
    [cantons["codigo_canton"], months.strftime("%Y-%m")], names=["codigo_canton", "anio_mes"]
)
cm = (
    hom.groupby(["codigo_canton", "anio_mes"]).size()
    .reindex(grid, fill_value=0)           # true zeros for months without cases
    .rename("victimas").reset_index()
)
cm["anio"] = cm["anio_mes"].str[:4].astype(int)
cm["mes"] = cm["anio_mes"].str[5:].astype(int)
cm = cm.merge(pop[["codigo_canton", "anio", "poblacion"]], on=["codigo_canton", "anio"], how="left")
check(cm["poblacion"].notna().all(), "every canton-month has population")

cm = cm.sort_values(["codigo_canton", "anio_mes"])
cm["victimas_3m"] = (
    cm.groupby("codigo_canton")["victimas"].rolling(WINDOW, min_periods=WINDOW).sum()
    .reset_index(level=0, drop=True)
)
cm["tasa_3m"] = cm["victimas_3m"] * (12 / WINDOW) / cm["poblacion"] * PER_100K
check(cm["victimas"].sum() == N, f"canton_mes keeps all {N:,} victims")
check(len(cm) == 221 * 152, f"canton_mes is complete: 221 x 152 = {len(cm):,} rows")

nm = cm.groupby("anio_mes", as_index=False).agg(
    victimas=("victimas", "sum"), poblacion=("poblacion", "sum")
)
nm["anio"] = nm["anio_mes"].str[:4].astype(int)
nm["mes"] = nm["anio_mes"].str[5:].astype(int)
nm["victimas_3m"] = nm["victimas"].rolling(WINDOW, min_periods=WINDOW).sum()
nm["tasa_3m"] = nm["victimas_3m"] * (12 / WINDOW) / nm["poblacion"] * PER_100K
check(nm["victimas"].sum() == N, "nacional_mes keeps all victims")

cols_m = ["anio_mes", "anio", "mes", "victimas", "victimas_3m", "poblacion", "tasa_3m"]
cm = cm[["codigo_canton"] + cols_m]
nm = nm[cols_m]

# ---------------------------------------------------------------------------
# 2. canton_anio.csv  (V1, V3, R2)
#    The browser sums victimas and persona_anios over the brushed years:
#    rate = sum(victimas) / sum(persona_anios) * 100k
# ---------------------------------------------------------------------------
ca = (
    hom.groupby(["codigo_canton", "anio"]).size().rename("victimas").reset_index()
    .merge(pop, on=["codigo_canton", "anio"], how="right")   # all 221 x 13
)
ca["victimas"] = ca["victimas"].fillna(0).astype(int)
ca["tasa"] = ca["victimas"] / ca["persona_anios"] * PER_100K
check(ca["victimas"].sum() == N, "canton_anio keeps all victims")
check(len(ca) == 221 * 13, f"canton_anio is complete: 221 x 13 = {len(ca):,} rows")

expected = hom.groupby("anio").size()
check((ca.groupby("anio")["victimas"].sum() == expected).all(), "yearly totals match the cleaned data")

ca = ca[["codigo_canton", "canton", "codigo_provincia", "anio", "meses",
         "victimas", "poblacion", "persona_anios", "tasa"]]

# ---------------------------------------------------------------------------
# 3. canton_periodo.csv  (V1 change metric, V3 slope chart, R2, R5)
# ---------------------------------------------------------------------------
rows = []
for name, (y0, y1) in PERIODS.items():
    sub = ca[(ca["anio"] >= y0) & (ca["anio"] <= y1)]
    agg = sub.groupby("codigo_canton")[["victimas", "persona_anios"]].sum()
    agg["tasa"] = agg["victimas"] / agg["persona_anios"] * PER_100K
    agg["bajo_conteo"] = agg["victimas"] < MIN_CASES
    rows.append(agg.add_suffix(f"_{name}"))
cp = cantons.set_index("codigo_canton").join(rows).reset_index()
cp["cambio_abs"] = cp["tasa_reciente"] - cp["tasa_base"]
# Ratio is undefined when the base rate is 0 (left empty, not infinite)
cp["cambio_ratio"] = cp["tasa_reciente"] / cp["tasa_base"].where(cp["tasa_base"] > 0)
check(len(cp) == 221, "canton_periodo has 221 cantons")

base_n = hom["anio"].between(*PERIODS["base"]).sum()
rec_n = hom["anio"].between(*PERIODS["reciente"]).sum()
check(cp["victimas_base"].sum() == base_n and cp["victimas_reciente"].sum() == rec_n,
      f"period totals match (base {base_n:,}, recent {rec_n:,})")
print(f"[info] cantons with < {MIN_CASES} victims: base {cp['bajo_conteo_base'].sum()}, "
      f"recent {cp['bajo_conteo_reciente'].sum()}")

# ---------------------------------------------------------------------------
# 4. perfil.csv  (V4, R4) - long format, non-zero cells only
#    Missing values are kept as "Sin dato" so every variable adds up to N.
# ---------------------------------------------------------------------------
parts = []
for var in PROFILE_VARS:
    g = (
        hom.assign(categoria=hom[var].fillna(MISSING_LABEL))
        .groupby(["codigo_canton", "anio", "categoria"]).size()
        .rename("victimas").reset_index()
    )
    g.insert(2, "variable", var)
    check(g["victimas"].sum() == N, f"perfil/{var} adds up to all victims")
    parts.append(g)
pf = pd.concat(parts, ignore_index=True)

# ---------------------------------------------------------------------------
# 5. Save
# ---------------------------------------------------------------------------
OUT.mkdir(parents=True, exist_ok=True)
print()
save(cm.round({"victimas_3m": 0, "tasa_3m": 3}).astype({"victimas_3m": "Int64"}), "canton_mes.csv")
save(nm.round({"victimas_3m": 0, "tasa_3m": 3}).astype({"victimas_3m": "Int64"}), "nacional_mes.csv")
save(ca.round({"persona_anios": 1, "tasa": 3}), "canton_anio.csv")
save(cp.round({"persona_anios_base": 1, "persona_anios_reciente": 1, "tasa_base": 3,
               "tasa_reciente": 3, "cambio_abs": 3, "cambio_ratio": 3}), "canton_periodo.csv")
save(pf, "perfil.csv")

# ---------------------------------------------------------------------------
# 6. Answer the analytic question with tables (week 2 "done when")
# ---------------------------------------------------------------------------
pd.set_option("display.width", 160)
show = ["canton", "victimas_base", "tasa_base", "victimas_reciente", "tasa_reciente", "cambio_abs"]
stable = cp[~cp["bajo_conteo_base"] & ~cp["bajo_conteo_reciente"]]
print(f"\n[info] largest increase in rate per 100k (cantons with >= {MIN_CASES} victims in both periods, "
      f"n = {len(stable)}):")
print(stable.nlargest(10, "cambio_abs")[show].round(1).to_string(index=False))
nat = {k: ca[ca["anio"].between(*v)]["victimas"].sum() / ca[ca["anio"].between(*v)]["persona_anios"].sum()
       * PER_100K for k, v in PERIODS.items()}
print(f"\n[info] national rate per 100k: base {nat['base']:.1f}, recent {nat['reciente']:.1f}")