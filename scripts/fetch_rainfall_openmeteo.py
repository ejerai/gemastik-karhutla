#!/usr/bin/env python3
"""
Ambil curah hujan harian (precipitation_sum) untuk seluruh sel grid nasional
(0.1 derajat, sama seperti grid GPM) dari Open-Meteo Forecast API -- yang
sudah termasuk "past_days" (histori terkini, berbasis observasi/reanalysis
model) dan beberapa hari proyeksi ke depan.

Open-Meteo gratis untuk pemakaian non-komersial (hingga 10.000 request/hari),
tanpa API key. Request di-batch (banyak koordinat per 1 URL) supaya jumlah
request tetap kecil.

Output: data/gpm_realtime_recent.parquet -- dipakai generate_dashboard_data.py
sebagai "tambalan" data terkini di atas arsip data/gpm_indonesia_combined.parquet.

Jalankan:
  python scripts/fetch_rainfall_openmeteo.py
"""
from __future__ import annotations

import time
from pathlib import Path

import numpy as np
import pandas as pd
import requests

SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / "data"
BASE_PARQUET = DATA_DIR / "gpm_indonesia_combined.parquet"
OUT_PATH = DATA_DIR / "gpm_realtime_recent.parquet"

# Grid nasional sama seperti dataset historis: 0.1 derajat, pusat sel .05
LAT_MIN, LAT_MAX = -10.95, 5.95
LON_MIN, LON_MAX = 95.05, 140.95
GRID_STEP = 0.1

PAST_DAYS = 16      # histori terkini yang diambil (untuk fitur lag/rolling)
FORECAST_DAYS = 8   # proyeksi ke depan (dipakai fitur day_of_year/month masa depan)
BATCH_SIZE = 150    # jumlah titik koordinat per request (jaga URL tetap wajar)
REQUEST_DELAY_SEC = 0.3

API_URL = "https://api.open-meteo.com/v1/forecast"


def log(msg: str) -> None:
    print(f"[fetch_rainfall_openmeteo] {msg}", flush=True)


def build_grid_points() -> list[tuple[float, float]]:
    """Pakai grid persis dari parquet historis kalau ada (biar identik),
    fallback bikin grid baru kalau file historis belum ada."""
    if BASE_PARQUET.exists():
        base = pd.read_parquet(BASE_PARQUET, columns=["lat", "lon"])
        pts = base.drop_duplicates()[["lat", "lon"]].astype("float64").round(2)
        return list(pts.itertuples(index=False, name=None))
    lats = np.round(np.arange(LAT_MIN, LAT_MAX + 1e-6, GRID_STEP), 2)
    lons = np.round(np.arange(LON_MIN, LON_MAX + 1e-6, GRID_STEP), 2)
    return [(float(la), float(lo)) for la in lats for lo in lons]


def fetch_batch(points: list[tuple[float, float]], session: requests.Session) -> pd.DataFrame:
    lats = ",".join(str(p[0]) for p in points)
    lons = ",".join(str(p[1]) for p in points)
    params = {
        "latitude": lats,
        "longitude": lons,
        "daily": "precipitation_sum",
        "past_days": PAST_DAYS,
        "forecast_days": FORECAST_DAYS,
        "timezone": "UTC",
    }
    resp = session.get(API_URL, params=params, timeout=60)
    resp.raise_for_status()
    data = resp.json()
    # Kalau cuma 1 titik, Open-Meteo balikin objek tunggal (bukan list)
    if isinstance(data, dict):
        data = [data]

    rows = []
    for (lat, lon), entry in zip(points, data):
        daily = entry.get("daily", {})
        times = daily.get("time", [])
        precs = daily.get("precipitation_sum", [])
        for d, p in zip(times, precs):
            rows.append({
                "lat": lat, "lon": lon, "acq_date": d,
                "precip_mm": 0.0 if p is None else float(p),
            })
    return pd.DataFrame(rows)


def main() -> None:
    points = build_grid_points()
    log(f"Total titik grid: {len(points):,} ({len(points)//BATCH_SIZE + 1} batch)")

    frames = []
    session = requests.Session()
    for i in range(0, len(points), BATCH_SIZE):
        batch = points[i:i + BATCH_SIZE]
        try:
            df = fetch_batch(batch, session)
            frames.append(df)
        except Exception as e:  # noqa: BLE001
            log(f"  Batch {i}-{i+len(batch)} gagal: {e}")
        if (i // BATCH_SIZE) % 20 == 0:
            log(f"  ...batch ke-{i//BATCH_SIZE + 1} selesai")
        time.sleep(REQUEST_DELAY_SEC)

    if not frames:
        log("Tidak ada data yang berhasil diambil dari Open-Meteo. Berhenti.")
        raise SystemExit(1)

    combined = pd.concat(frames, ignore_index=True)
    combined["acq_date"] = pd.to_datetime(combined["acq_date"])
    combined["lat"] = combined["lat"].astype("float64").round(2)
    combined["lon"] = combined["lon"].astype("float64").round(2)

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    combined.to_parquet(OUT_PATH, index=False)
    log(f"Selesai. {len(combined):,} baris disimpan ke {OUT_PATH} "
        f"({combined.acq_date.min().date()} s/d {combined.acq_date.max().date()})")


if __name__ == "__main__":
    main()
