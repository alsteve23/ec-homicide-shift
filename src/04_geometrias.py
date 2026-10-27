"""
04_geometrias.py
Build the web map geometry: reproject, clean, simplify and split the INEC
canton layer into a TopoJSON with two objects (mainland + Galapagos).

Input:  data/external/cantones/cantones.shp   (INEC, EPSG:32717)
        data/processed/poblacion_canton_anio.csv  (to check canton codes)
Output: data/processed/cantones.topo.json
        objects: "continente" (218 cantons), "galapagos" (3 cantons)
        properties: codigo_canton, canton

Requires Node.js (npx). mapshaper is run with a pinned version through npx.
Run from anywhere:  python src/04_geometrias.py
"""

import shutil
import subprocess
import sys
from pathlib import Path

import geopandas as gpd
import pandas as pd

# ---------------------------------------------------------------------------
# Paths and parameters
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parents[1]
SHP_FILE = ROOT / "data" / "external" / "cantones" / "cantones.shp"
POP_FILE = ROOT / "data" / "processed" / "poblacion_canton_anio.csv"
OUT_FILE = ROOT / "data" / "processed" / "cantones.topo.json"

MAPSHAPER = "mapshaper@0.6.102"   # pinned version
SIMPLIFY = "5%"                   # share of vertices kept (Visvalingam, weighted)
QUANTIZATION = 100_000            # TopoJSON coordinate precision
MAX_BYTES = 1_000_000             # size target for the web (< 1 MB)
MAX_AREA_CHANGE = 0.05            # max relative area change per canton (5%)
UTM = "EPSG:32717"                # original CRS, used to compare areas in m2


def check(condition: bool, message: str) -> None:
    """Stop the pipeline if a verification fails."""
    if not condition:
        sys.exit(f"[FAIL] {message}")
    print(f"[ok]   {message}")


# ---------------------------------------------------------------------------
# 1. Run mapshaper
#    -clean (before):  the source layer has gaps/overlaps between neighbours;
#                      fixing them first keeps shared borders consistent.
#    -proj wgs84:      EPSG:32717 -> EPSG:4326 for D3.
#    -simplify:        keep-shapes never drops a small canton.
#    -clean (after):   repairs intersections created by simplification.
#    -split region:    two TopoJSON objects; Galapagos is drawn in an inset.
# ---------------------------------------------------------------------------
npx = shutil.which("npx")
check(npx is not None, "Node.js / npx is installed")

cmd = [
    npx, "--yes", MAPSHAPER,
    "-i", str(SHP_FILE), "encoding=utf8",
    "-clean",
    "-proj", "wgs84",
    "-filter-fields", "code,name_es",
    "-rename-fields", "codigo_canton=code,canton=name_es",
    "-simplify", SIMPLIFY, "weighted", "keep-shapes",
    "-clean",
    "-each", 'region = codigo_canton.slice(0, 2) == "20" ? "galapagos" : "continente"',
    "-split", "region",
    "-each", "delete region",
    "-o", str(OUT_FILE), "format=topojson", f"quantization={QUANTIZATION}", "force",
]
OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
result = subprocess.run(cmd, capture_output=True, text=True)
print(result.stdout + result.stderr)
check(result.returncode == 0, "mapshaper finished without errors")

# ---------------------------------------------------------------------------
# 2. Validate the output
# ---------------------------------------------------------------------------
size = OUT_FILE.stat().st_size
check(size < MAX_BYTES, f"file size {size / 1000:.0f} KB < 1 MB")

layers = {name: gpd.read_file(OUT_FILE, layer=name) for name in ["continente", "galapagos"]}
check(len(layers["continente"]) == 218 and len(layers["galapagos"]) == 3,
      "218 mainland + 3 Galapagos cantons")
check(set(layers["galapagos"]["codigo_canton"].str[:2]) == {"20"}, "Galapagos layer has only province 20")

simplified = pd.concat(layers.values(), ignore_index=True)
codes_pop = set(pd.read_csv(POP_FILE, dtype={"codigo_canton": str})["codigo_canton"])
check(set(simplified["codigo_canton"]) == codes_pop, "canton codes match the population file")
check(simplified.geometry.notna().all() and (~simplified.geometry.is_empty).all(),
      "no canton lost its geometry")

# Area change per canton: simplified vs. original (both in UTM, m2)
orig = gpd.read_file(SHP_FILE, encoding="utf-8").set_index("code").to_crs(UTM)
simp = (gpd.GeoDataFrame(simplified).set_crs("EPSG:4326", allow_override=True)
        .set_index("codigo_canton").to_crs(UTM))
change = (simp.area / orig.loc[simp.index].area - 1).abs()
check(change.max() < MAX_AREA_CHANGE,
      f"area change per canton: median {change.median():.2%}, max {change.max():.2%} "
      f"({simp.loc[change.idxmax(), 'canton']})")

print(f"\nSaved {OUT_FILE.relative_to(ROOT)}")