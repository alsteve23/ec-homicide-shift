"""
05_app_data.py
Copy the aggregate files used by the web app into app/data/.

GitHub Pages only publishes app/, so the app keeps its own copy of the
aggregates. Only aggregate, publishable files are copied (no individual
records, no coordinates).

Run from anywhere:  python src/05_app_data.py
"""

import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data" / "processed"
DST = ROOT / "app" / "data"

FILES = [
    "cantones.topo.json",  # V1 geometry
    "canton_anio.csv",     # V1 rates over the brushed years (and V3 later)
    "canton_mes.csv",      # V2 canton lines
    "nacional_mes.csv",    # V2 national line
]

# Columns that must never reach the app (see CLAUDE.md, ethics rules)
FORBIDDEN = ["coordenada_x", "coordenada_y", "edad", "sexo", "fecha_infraccion"]


def main() -> None:
    DST.mkdir(parents=True, exist_ok=True)
    for name in FILES:
        src = SRC / name
        if not src.exists():
            sys.exit(f"[FAIL] missing {src.relative_to(ROOT)}: run src/03_agregados.py and src/04_geometrias.py first")
        if name.endswith(".csv"):
            header = src.open(encoding="utf-8").readline().strip().split(",")
            bad = [c for c in header if c in FORBIDDEN]
            if bad:
                sys.exit(f"[FAIL] {name} contains non-aggregate columns: {bad}")
        shutil.copy2(src, DST / name)
        print(f"[ok]   app/data/{name} ({(DST / name).stat().st_size / 1024:,.0f} KB)")


if __name__ == "__main__":
    main()
