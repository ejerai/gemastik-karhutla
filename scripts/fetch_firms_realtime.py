#!/usr/bin/env python3
"""
Ambil hotspot kebakaran real-time (near real-time, delay ~3 jam dari satelit)
dari NASA FIRMS Area API, untuk wilayah Indonesia, lalu simpan sebagai
data/fire_realtime_14d.csv dengan skema kolom yang sama seperti sebelumnya.

Butuh MAP_KEY gratis dari: https://firms.modaps.eosdis.nasa.gov/api/map_key/
Set sebagai environment variable FIRMS_MAP_KEY.

MAP_KEY punya limit 5.000 transaksi / 10 menit -- script ini cuma pakai
beberapa transaksi (3 window x per sensor), jauh di bawah limit.

Jalankan:
  FIRMS_MAP_KEY=xxxxxxxx python scripts/fetch_firms_realtime.py
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd
import requests

SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / "data"

# Bounding box Indonesia: west,south,east,north (samakan dengan cakupan grid GPM)
BBOX = "95.0,-11.0,141.0,6.0"

# Sensor yang dipakai. VIIRS resolusinya lebih baik (375m) dibanding MODIS (1km).
SOURCES = ["VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT"]

# PENTING: endpoint Area API FIRMS batas day_range-nya cuma 1..5 per request
# (dikonfirmasi dari dokumentasi resmi firms.modaps.eosdis.nasa.gov/api/area/),
# BUKAN 10 seperti yang ditulis sebelumnya -- itu bug yang bikin API selalu
# balas 400 Bad Request. Supaya tetap dapat cakupan ~14 hari (sesuai nama file
# fire_realtime_14d.csv), kita pecah jadi 3 window 5 hari yang berantai
# mundur dari hari ini, pakai parameter [DATE] opsional di endpoint.
MAX_DAY_RANGE = 5
N_WINDOWS = 3  # 3 x 5 hari = cakupan 15 hari ke belakang

# Kolom target, disamakan dengan skema fire_realtime_14d.csv yang sudah ada
TARGET_COLUMNS = [
    "latitude", "longitude", "bright_ti4", "scan", "track", "acq_date",
    "acq_time", "satellite", "instrument", "confidence", "version",
    "bright_ti5", "frp", "daynight", "brightness", "bright_t31",
]


def log(msg: str) -> None:
    print(f"[fetch_firms_realtime] {msg}", flush=True)


def fetch_source_window(map_key: str, source: str, start_date, day_range: int) -> pd.DataFrame:
    """start_date: tanggal AWAL window (paling lama). Endpoint FIRMS dengan
    [DATE] mengembalikan data dari [DATE] s/d [DATE + day_range - 1]."""
    date_str = start_date.strftime("%Y-%m-%d")
    url = (f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{map_key}/{source}/"
           f"{BBOX}/{day_range}/{date_str}")
    resp = requests.get(url, timeout=60)
    resp.raise_for_status()
    if resp.text.strip().lower().startswith(("invalid", "error", "<!doctype")):
        raise RuntimeError(f"Respons FIRMS tidak valid untuk {source} ({date_str}): {resp.text[:200]}")
    from io import StringIO
    df = pd.read_csv(StringIO(resp.text))
    return df


def fetch_source(map_key: str, source: str) -> pd.DataFrame:
    today = datetime.now(timezone.utc).date()
    log(f"Mengambil {source} ({N_WINDOWS * MAX_DAY_RANGE} hari terakhir, "
        f"{N_WINDOWS} window x {MAX_DAY_RANGE} hari)...")
    frames = []
    for w in range(N_WINDOWS):
        # Window w=0 = paling baru (5 hari terakhir), w=1 = 5 hari sebelum itu, dst.
        window_start = today - timedelta(days=(w + 1) * MAX_DAY_RANGE - 1)
        try:
            df = fetch_source_window(map_key, source, window_start, MAX_DAY_RANGE)
            if not df.empty:
                frames.append(df)
        except Exception as e:  # noqa: BLE001
            log(f"  Window {window_start} gagal: {e}")
    if not frames:
        log(f"  {source}: 0 baris (tidak ada hotspot terdeteksi / semua window gagal).")
        return pd.DataFrame()
    df = pd.concat(frames, ignore_index=True)
    if "acq_date" in df.columns and "acq_time" in df.columns and "satellite" in df.columns:
        df = df.drop_duplicates(subset=["latitude", "longitude", "acq_date", "acq_time"], keep="last")
    log(f"  {source}: {len(df):,} baris ({df['acq_date'].min()} s/d {df['acq_date'].max()})")
    return df


def main() -> None:
    map_key = os.environ.get("FIRMS_MAP_KEY")
    if not map_key:
        log("ERROR: environment variable FIRMS_MAP_KEY belum diset. "
            "Daftar gratis di https://firms.modaps.eosdis.nasa.gov/api/map_key/")
        sys.exit(1)

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    out_path = DATA_DIR / "fire_realtime_14d.csv"
    old_data = None
    if out_path.exists():
        try:
            old_data = pd.read_csv(out_path)
            log(f"  Data run sebelumnya ditemukan: {len(old_data):,} baris "
                f"(dipakai fallback kalau ada sensor yang gagal kali ini)")
        except Exception as e:  # noqa: BLE001
            log(f"  Gagal baca data run sebelumnya, lanjut tanpa fallback: {e}")

    frames = []
    failed_sources = []
    for source in SOURCES:
        try:
            df = fetch_source(map_key, source)
            if not df.empty:
                frames.append(df)
        except Exception as e:  # noqa: BLE001
            log(f"  Gagal mengambil {source}: {e}")
            failed_sources.append(source)

    if not frames and old_data is None:
        log("Tidak ada data yang berhasil diambil dari FIRMS, dan tidak ada data lama "
            "sebagai fallback. Berhenti.")
        sys.exit(1)

    if frames:
        combined = pd.concat(frames, ignore_index=True)
        # Samakan skema kolom dengan file lama (beberapa kolom mungkin tidak ada
        # tergantung sensor, isi dengan NaN kalau memang tidak tersedia)
        for col in TARGET_COLUMNS:
            if col not in combined.columns:
                combined[col] = pd.NA
        combined = combined[TARGET_COLUMNS]
    else:
        combined = pd.DataFrame(columns=TARGET_COLUMNS)
        log("  Semua sensor gagal run ini -- 100% data yang disimpan berasal dari run sebelumnya.")

    if old_data is not None and len(old_data) > 0 and failed_sources:
        # Ada sensor yang gagal: gabung sama data lama supaya baris dari
        # sensor yang gagal kali ini tidak hilang (fallback), baris baru
        # (sensor yang berhasil) tetap menang kalau ada overlap.
        merged = pd.concat([old_data, combined], ignore_index=True)
        merged = merged.drop_duplicates(
            subset=["latitude", "longitude", "acq_date", "acq_time", "satellite"], keep="last"
        )
        log(f"  Sensor gagal: {', '.join(failed_sources)} -- digabung dengan data lama sebagai fallback.")
    else:
        merged = combined

    merged = merged.drop_duplicates(subset=["latitude", "longitude", "acq_date", "acq_time", "satellite"])
    merged = merged.sort_values("acq_date")

    merged.to_csv(out_path, index=False)
    log(f"Selesai. {len(merged):,} baris disimpan ke {out_path} "
        f"({merged['acq_date'].min()} s/d {merged['acq_date'].max()})")


if __name__ == "__main__":
    main()