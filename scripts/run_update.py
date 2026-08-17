#!/usr/bin/env python3
"""
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
