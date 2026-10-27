"""
01_limpieza.py
Clean and merge the intentional homicide records (2014-2025 + Jan-Aug 2026).

Input:  data/raw/mdi_homicidiosintencionales_pm_2014_2025.xlsx
        data/raw/mdi_homicidiosintencionales_pm_2026_enero_agosto.xlsx
Output: data/interim/homicidios_limpio.csv  (victim-level, NOT for publication;
        data/interim/ is git-ignored)

Run from anywhere:  python src/01_limpieza.py
"""

import sys
import unicodedata
from pathlib import Path

import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
INTERIM = ROOT / "data" / "interim"

FILES = [
    RAW / "mdi_homicidiosintencionales_pm_2014_2025.xlsx",
    RAW / "mdi_homicidiosintencionales_pm_2026_enero_agosto.xlsx",
]

# ---------------------------------------------------------------------------
# Verification totals (see docs/data_dictionary.md)
# ---------------------------------------------------------------------------
EXPECTED_YEAR = {
    2014: 1310, 2015: 1050, 2016: 959, 2017: 970, 2018: 996, 2019: 1189,
    2020: 1371, 2021: 2495, 2022: 4886, 2023: 8247, 2024: 7065, 2025: 9283,
    2026: 5676,  # Jan-Aug only
}

# ---------------------------------------------------------------------------
# Columns kept (data minimization). Everything else is dropped.
# ---------------------------------------------------------------------------
KEEP = [
    "codigo_provincia", "provincia", "codigo_canton", "canton",
    "fecha_infraccion", "tipo_muerte", "area_hecho",
    "arma", "presun_motiva_observada", "edad", "sexo",
]
# Used only for a consistency check, then dropped
CHECK_ONLY = ["probable_causa_motivada", "medida_edad"]

# ---------------------------------------------------------------------------
# Groupings (confirmed 2026-10-26). Keys are normalized: upper case, no accents.
# ---------------------------------------------------------------------------
ARMA_GRUPO = {
    "ARMA DE FUEGO": "Fuego",
    "ARMA BLANCA": "Blanca",
    "ARMA CONTUNDENTE": "Otra",
    "CONSTRICTORA": "Otra",
    "OTROS": "Otra",
    "SUSTANCIAS": "Otra",
}

MOTIVO_GRUPO = {
    # Threat
    "AMENAZA": "Amenaza",
    # Drugs
    "TRAFICO INTERNO DE DROGAS (MICROTRAFICO)": "Drogas",
    "TRAFICO INTERNACIONAL DE DROGA": "Drogas",
    # Fights
    "RINAS": "Riñas",
    # Robbery
    "ROBO A PERSONAS": "Robo",
    "ROBO A DOMICILIOS": "Robo",
    "ROBO DE CARROS": "Robo",
    "ROBO DE MOTOS": "Robo",
    "ROBO EN EJES VIALES O CARRETERAS": "Robo",
    "ROBO A UNIDADES ECONOMICAS": "Robo",
    "ROBO A ENTIDADES FINANCIERAS": "Robo",
    "ROBO DE BIENES PATRIMONIALES": "Robo",
    "ABIGEATO": "Robo",
    # Interpersonal
    "SENTIMENTAL": "Interpersonal",
    "EMOCIONAL": "Interpersonal",
    "MALTRATO": "Interpersonal",
    "DEUDAS": "Interpersonal",
    "LITIGIO DE TIERRAS": "Interpersonal",
    "LITIGIO DE BIENES": "Interpersonal",
    # Other
    "ACTOS DE ODIO": "Otros",
    "LINCHAMIENTO": "Otros",
    "SECUESTRO": "Otros",
    "SECUESTRO EXPRESS": "Otros",
    "TERRORISMO": "Otros",
    "DEFENSA PROPIA": "Otros",
    "VIOLACION SEXUAL (DESCONOCIDO)": "Otros",
    "VIOLACION FAMILIAR DIRECTO (PERSONA CONOCIDA)": "Otros",
    "TRASTORNOS MENTALES": "Otros",
    "EVASION DE LA JUSTICIA": "Otros",
    "CONTRABANDO": "Otros",
    "TRAFICOS DE MIGRANTES": "Otros",
    "TRAFICO DE ARMAS": "Otros",
    "TRATA DE PERSONAS": "Otros",
    "RECEPTACION ILEGAL (CACHINERIA)": "Otros",
}

EDAD_BINS = [-1, 17, 24, 34, 44, 59, 200]
EDAD_LABELS = ["0-17", "18-24", "25-34", "35-44", "45-59", "60+"]


def normalize(s: pd.Series) -> pd.Series:
    """Upper case, strip, remove accents (Ñ -> N). Keeps missing values."""
    def _norm(x):
        if pd.isna(x):
            return x
        x = unicodedata.normalize("NFKD", str(x)).encode("ascii", "ignore").decode()
        return x.strip().upper()
    return s.map(_norm)


def check(condition: bool, message: str) -> None:
    """Stop the pipeline if a verification fails."""
    if not condition:
        sys.exit(f"[FAIL]{message}")
    print(f"[ok]   {message}")


# ---------------------------------------------------------------------------
# 1. Load and merge
# ---------------------------------------------------------------------------
frames = []
for f in FILES:
    d = pd.read_excel(f, sheet_name=1)  # sheet 0 is metadata
    print(f"Loaded {f.name}: {len(d):,} rows, {d.shape[1]} columns")
    frames.append(d)

check(list(frames[0].columns) == list(frames[1].columns), "both files have the same columns")
df = pd.concat(frames, ignore_index=True)
n_total = len(df)

# ---------------------------------------------------------------------------
# 2. Missing values: SIN_DATO -> NaN (in every text column)
# ---------------------------------------------------------------------------
df = df.replace("SIN_DATO", np.nan)

# ---------------------------------------------------------------------------
# 3. Types and codes
# ---------------------------------------------------------------------------
df["fecha_infraccion"] = pd.to_datetime(df["fecha_infraccion"], errors="coerce")
check(df["fecha_infraccion"].notna().all(), "every row has a valid date")

df["codigo_provincia"] = df["codigo_provincia"].astype(int).astype(str).str.zfill(2)
df["codigo_canton"] = df["codigo_canton"].astype(int).astype(str).str.zfill(4)
check(df["codigo_canton"].str.len().eq(4).all(), "canton codes have 4 digits")
check((df["codigo_canton"].str[:2] == df["codigo_provincia"]).all(),
      "canton code starts with its province code")

df["edad"] = pd.to_numeric(df["edad"], errors="coerce")
check(df["medida_edad"].dropna().eq("A").all(), "age is always measured in years")

# ---------------------------------------------------------------------------
# 4. Consistency check (then drop): medical cause vs. weapon
# ---------------------------------------------------------------------------
fuego_arma = (df["arma"] == "ARMA DE FUEGO").sum()
fuego_causa = (normalize(df["probable_causa_motivada"]) == "HERIDA POR ARMA DE FUEGO").sum()
print(f"[info] firearm in `arma`: {fuego_arma:,} | firearm wound in "
      f"`probable_causa_motivada`: {fuego_causa:,} | diff: {fuego_arma - fuego_causa:,}")

# ---------------------------------------------------------------------------
# 5. Drop sensitive and unused columns
# ---------------------------------------------------------------------------
df = df[KEEP].copy()

# ---------------------------------------------------------------------------
# 6. Derived variables
# ---------------------------------------------------------------------------
df["anio"] = df["fecha_infraccion"].dt.year
df["mes"] = df["fecha_infraccion"].dt.month
df["anio_mes"] = df["fecha_infraccion"].dt.strftime("%Y-%m")

arma_norm = normalize(df["arma"])
df["arma_grupo"] = arma_norm.map(ARMA_GRUPO)
unmapped = set(arma_norm.dropna()) - set(ARMA_GRUPO)
check(not unmapped, f"every weapon category is mapped {sorted(unmapped) or ''}")

motivo_norm = normalize(df["presun_motiva_observada"])
df["motivo_grupo"] = motivo_norm.map(MOTIVO_GRUPO)
unmapped = set(motivo_norm.dropna()) - set(MOTIVO_GRUPO)
check(not unmapped, f"every motive category is mapped {sorted(unmapped) or ''}")

df["grupo_edad"] = pd.cut(df["edad"], bins=EDAD_BINS, labels=EDAD_LABELS)

# ---------------------------------------------------------------------------
# 7. Verification against the original totals
# ---------------------------------------------------------------------------
check(len(df) == n_total, f"no rows lost ({len(df):,})")
by_year = df.groupby("anio").size().to_dict()
for year, expected in EXPECTED_YEAR.items():
    check(by_year.get(year) == expected, f"{year}: {by_year.get(year)} == {expected}")
check(df.loc[df["anio"] == 2026, "mes"].max() == 8, "2026 ends in August")

# ---------------------------------------------------------------------------
# 8. Missing-value report (goes to docs/data_dictionary.md)
# ---------------------------------------------------------------------------
print("\nMissing values after cleaning:")
miss = df.isna().sum()
print(miss[miss > 0].to_string())

# ---------------------------------------------------------------------------
# 9. Save (victim-level: interim only, never publish)
# ---------------------------------------------------------------------------
INTERIM.mkdir(parents=True, exist_ok=True)
out = INTERIM / "homicidios_limpio.csv"
df.to_csv(out, index=False, encoding="utf-8", lineterminator="\n")
print(f"\nSaved {out.relative_to(ROOT)} ({len(df):,} rows, {df.shape[1]} columns)")