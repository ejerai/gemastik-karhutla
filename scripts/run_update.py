#!/usr/bin/env python3
"""
Orkestrator pipeline update data Karhutla EWS. Urutan:
  1. fetch_firms_realtime.py       -> refresh data/fire_realtime_14d.csv
  2. fetch_rainfall_openmeteo.py   -> refresh data/gpm_realtime_recent.parquet
  3. generate_dashboard_data.py    -> regenerate public/dashboard_data.json

Kalau salah satu langkah fetch gagal (mis. FIRMS_MAP_KEY belum diset, atau
API sedang down), pipeline tetap lanjut pakai data yang sudah ada supaya
dashboard tidak pernah kosong -- cuma datanya jadi tidak se-terbaru biasanya
(masih valid, cuma "generated_at" & "last_updated" di header bakal
menunjukkan kapan sukses terakhir).

Jalankan:
  FIRMS_MAP_KEY=xxxxxxxx python scripts/run_update.py
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
PYTHON = sys.executable


def log(msg: str) -> None:
    print(f"[run_update] {msg}", flush=True)


def run_step(name: str, script: str, required: bool = False) -> bool:
    log(f"=== {name} ===")
    result = subprocess.run([PYTHON, str(SCRIPT_DIR / script)])
    ok = result.returncode == 0
    if not ok:
        level = "GAGAL (wajib, berhenti)" if required else "GAGAL (dilewati, lanjut pakai data lama)"
        log(f"{name}: {level}")
        if required:
            sys.exit(1)
    return ok


def main() -> None:
    run_step("Fetch hotspot FIRMS realtime", "fetch_firms_realtime.py", required=False)
    run_step("Fetch curah hujan Open-Meteo", "fetch_rainfall_openmeteo.py", required=False)
    run_step("Regenerate dashboard_data.json", "generate_dashboard_data.py", required=True)
    log("Pipeline update selesai.")


if __name__ == "__main__":
    main()
