#!/usr/bin/env python3
"""
Ambil hotspot kebakaran real-time (near real-time, delay ~3 jam dari satelit)
dari NASA FIRMS Area API, untuk wilayah Indonesia, lalu simpan sebagai
data/fire_realtime_14d.csv dengan skema kolom yang sama seperti sebelumnya.

Butuh MAP_KEY gratis dari: https://firms.modaps.eosdis.nasa.gov/api/map_key/
Set sebagai environment variable FIRMS_MAP_KEY.

MAP_KEY punya limit 5.000 transaksi / 10 menit -- script ini cuma pakai
beberapa transaksi (1 per sensor), jadi jauh di bawah limit.

Jalankan:
  FIRMS_MAP_KEY=xxxxxxxx python scripts/fetch_firms_realtime.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pandas as pd
import requests

SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / "data"

# Bounding box Indonesia: west,south,east,north (samakan dengan cakupan grid GPM)
BBOX = "95.0,-11.0,141.0,6.0"

# Sensor yang dipakai. VIIRS resolusinya lebih baik (375m) dibanding MODIS (1km).
SOURCES = ["VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT"]

# Area API FIRMS maksimal day_range=10 per request untuk endpoint area.
DAY_RANGE = 10

# Kolom target, disamakan dengan skema fire_realtime_14d.csv yang sudah ada
TARGET_COLUMNS = [
    "latitude", "longitude", "bright_ti4", "scan", "track", "acq_date",
    "acq_time", "satellite", "instrument", "confidence", "version",
    "bright_ti5", "frp", "daynight", "brightness", "bright_t31",
]


def log(msg: str) -> None:
    print(f"[fetch_firms_realtime] {msg}", flush=True)


def fetch_source(map_key: str, source: str) -> pd.DataFrame:
    url = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{map_key}/{source}/{BBOX}/{DAY_RANGE}"
    log(f"Mengambil {source} ({DAY_RANGE} hari terakhir)...")
    resp = requests.get(url, timeout=60)
    resp.raise_for_status()
    if resp.text.strip().lower().startswith(("invalid", "error", "<!doctype")):
        raise RuntimeError(f"Respons FIRMS tidak valid untuk {source}: {resp.text[:200]}")
    from io import StringIO
    df = pd.read_csv(StringIO(resp.text))
    if df.empty:
        log(f"  {source}: 0 baris (tidak ada hotspot terdeteksi).")
        return df
    log(f"  {source}: {len(df):,} baris ({df['acq_date'].min()} s/d {df['acq_date'].max()})")
    return df


def main() -> None:
    map_key = os.environ.get("FIRMS_MAP_KEY")
    if not map_key:
        log("ERROR: environment variable FIRMS_MAP_KEY belum diset. "
            "Daftar gratis di https://firms.modaps.eosdis.nasa.gov/api/map_key/")
        sys.exit(1)

    frames = []
    for source in SOURCES:
        try:
            df = fetch_source(map_key, source)
            if not df.empty:
                frames.append(df)
        except Exception as e:  # noqa: BLE001
            log(f"  Gagal mengambil {source}: {e}")

    if not frames:
        log("Tidak ada data yang berhasil diambil dari FIRMS. Berhenti tanpa mengubah file lama.")
        sys.exit(1)

    combined = pd.concat(frames, ignore_index=True)

    # Samakan skema kolom dengan file lama (beberapa kolom mungkin tidak ada
    # tergantung sensor, isi dengan NaN kalau memang tidak tersedia)
    for col in TARGET_COLUMNS:
        if col not in combined.columns:
            combined[col] = pd.NA
    combined = combined[TARGET_COLUMNS]

    # Buang duplikat kalau ada overlap antar sensor/hari
    combined = combined.drop_duplicates(subset=["latitude", "longitude", "acq_date", "acq_time", "satellite"])
    combined = combined.sort_values("acq_date")

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    out_path = DATA_DIR / "fire_realtime_14d.csv"
    combined.to_csv(out_path, index=False)
    log(f"Selesai. {len(combined):,} baris disimpan ke {out_path} "
        f"({combined['acq_date'].min()} s/d {combined['acq_date'].max()})")


if __name__ == "__main__":
    main()
