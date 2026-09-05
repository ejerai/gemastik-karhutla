#!/usr/bin/env python3
"""
  python scripts/fetch_rainfall_openmeteo.py
"""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path
from datetime import datetime, timezone

import numpy as np
import pandas as pd
import requests

SCRIPT_DIR = Path(__file__).parent
sys.path.insert(0, str(SCRIPT_DIR))
from id_boundary import is_indonesia_vectorized  # noqa: E402
DATA_DIR = SCRIPT_DIR.parent / "data"
BASE_PARQUET = DATA_DIR / "gpm_indonesia_combined.parquet"
OUT_PATH = DATA_DIR / "gpm_realtime_recent.parquet"

LAT_MIN, LAT_MAX = -10.95, 5.95
LON_MIN, LON_MAX = 95.05, 140.95
GRID_STEP = 0.1
PAST_DAYS = 4 
FORECAST_DAYS = 8  
BATCH_SIZE = 150    
REQUEST_DELAY_SEC = 3.0
N_SHARDS = 2
SHARD_OVERRIDE_ENV = "FETCH_SHARD_OVERRIDE" 


def resolve_shard_index() -> int:
    override = os.environ.get(SHARD_OVERRIDE_ENV)
    if override is not None:
        try:
            idx = int(override) % N_SHARDS
            log(f"  Shard di-override manual lewat {SHARD_OVERRIDE_ENV}={idx} (dari {N_SHARDS} shard)")
            return idx
        except ValueError:
            log(f"  PERINGATAN: {SHARD_OVERRIDE_ENV}='{override}' bukan angka valid, abaikan.")
    hour = datetime.now(timezone.utc).hour
    idx = (hour // 3) % N_SHARDS
    return idx

API_URL = "https://api.open-meteo.com/v1/forecast"


def log(msg: str) -> None:
    print(f"[fetch_rainfall_openmeteo] {msg}", flush=True)


def build_grid_points() -> list[tuple[float, float]]:
    """pakai grid persis dari parquet historis kalau ada (biar identik),
    fallback bikin grid baru kalau file historis belum ada. Grid difilter ke
    sel DARAT saja -- grid GPM mentah adalah kotak persegi (bounding box)
    yang ~76% isinya laut (curah hujan di tengah laut tidak relevan buat
    risiko karhutla, dan cuma buang-buang kuota API). Filter pakai paket
    global-land-mask (data land/sea sudah ter-bundle offline, tidak perlu
    internet saat runtime)."""
    if BASE_PARQUET.exists():
        base = pd.read_parquet(BASE_PARQUET, columns=["lat", "lon"])
        pts = base.drop_duplicates()[["lat", "lon"]].astype("float64").round(2)
    else:
        lats = np.round(np.arange(LAT_MIN, LAT_MAX + 1e-6, GRID_STEP), 2)
        lons = np.round(np.arange(LON_MIN, LON_MAX + 1e-6, GRID_STEP), 2)
        pts = pd.DataFrame(
            [(la, lo) for la in lats for lo in lons], columns=["lat", "lon"]
        )

    n_before = len(pts)
    is_id = is_indonesia_vectorized(pts["lat"].to_numpy(), pts["lon"].to_numpy())
    pts = pts[is_id]
    log(f"  Filter wilayah Indonesia: {len(pts):,} dari {n_before:,} sel ({len(pts)/n_before*100:.1f}%) "
        f"-- sel laut & sel di negara lain (Malaysia/Brunei/PNG/Timor-Leste yang kesenggol BBOX) "
        f"dibuang di sini, jadi kuota Open-Meteo tidak kebuang buat sel di luar Indonesia.")

    return list(pts.itertuples(index=False, name=None))


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


MAX_RETRIES = 3
RETRY_BACKOFF_SEC = 15


def fetch_batch_with_retry(points: list[tuple[float, float]], session: requests.Session) -> pd.DataFrame | None:
    """Bungkus fetch_batch dengan retry+backoff khusus buat HTTP 429 (rate
    limit) -- ini yang paling sering bikin batch gagal beruntun kalau limit
    kesenggol di tengah run. Error lain (timeout, 5xx, dll) langsung
    dianggap gagal tanpa retry supaya run tidak macet kelamaan."""
    for attempt in range(MAX_RETRIES):
        try:
            return fetch_batch(points, session)
        except requests.exceptions.HTTPError as e:
            status = e.response.status_code if e.response is not None else None
            if status == 429 and attempt < MAX_RETRIES - 1:
                wait = RETRY_BACKOFF_SEC * (attempt + 1)
                log(f"  Kena rate limit (429) pada 1 batch, tunggu {wait}s lalu coba lagi "
                    f"(percobaan {attempt + 2}/{MAX_RETRIES})...")
                time.sleep(wait)
                continue
            log(f"  Batch gagal (HTTP {status}): {e}")
            return None
        except Exception as e:  # noqa: BLE001
            log(f"  Batch gagal: {e}")
            return None
    return None


def main() -> None:
    all_points = build_grid_points()
    shard_idx = resolve_shard_index()
    points = all_points[shard_idx::N_SHARDS]
    log(f"Shard hari ini: {shard_idx + 1}/{N_SHARDS} -- {len(points):,} dari "
        f"{len(all_points):,} sel grid nasional ({len(points)/max(1,len(all_points))*100:.1f}%)")
    log(f"Total titik grid shard ini: {len(points):,} ({len(points)//BATCH_SIZE + 1} batch)")

    est_weight = (len(points) // BATCH_SIZE + 1) * BATCH_SIZE * ((PAST_DAYS + FORECAST_DAYS) / 14) * (1 / 10)
    log(f"  Estimasi berat kuota run ini: ~{est_weight:,.0f} dari limit harian 10.000 "
        f"(rumus Open-Meteo: n_lokasi x hari/14 x variabel/10)")
    old_data = None
    if OUT_PATH.exists():
        try:
            old_data = pd.read_parquet(OUT_PATH)
            log(f"  Data run sebelumnya ditemukan: {len(old_data):,} baris, "
                f"{old_data[['lat','lon']].drop_duplicates().shape[0]:,} sel unik "
                f"(dipakai fallback untuk sel yang gagal kali ini)")
        except Exception as e:  # noqa: BLE001
            log(f"  Gagal baca data run sebelumnya, lanjut tanpa fallback: {e}")

    frames = []
    n_failed_batches = 0
    session = requests.Session()
    for i in range(0, len(points), BATCH_SIZE):
        batch = points[i:i + BATCH_SIZE]
        df = fetch_batch_with_retry(batch, session)
        if df is not None and not df.empty:
            frames.append(df)
        else:
            n_failed_batches += 1
        if (i // BATCH_SIZE) % 20 == 0:
            log(f"  ...batch ke-{i//BATCH_SIZE + 1} selesai")
        time.sleep(REQUEST_DELAY_SEC)

    total_batches = len(points) // BATCH_SIZE + 1
    if n_failed_batches > 0:
        log(f"  PERINGATAN: {n_failed_batches}/{total_batches} batch gagal fetch kali ini "
            f"(~{n_failed_batches * BATCH_SIZE:,} titik grid) -- sel-sel itu akan pakai "
            f"data run sebelumnya (kalau tersedia) supaya tidak hilang dari peta.")

    if not frames and old_data is None:
        log("Tidak ada data yang berhasil diambil dari Open-Meteo, dan tidak ada data lama "
            "sebagai fallback. Berhenti.")
        raise SystemExit(1)

    if frames:
        combined = pd.concat(frames, ignore_index=True)
        combined["acq_date"] = pd.to_datetime(combined["acq_date"])
        combined["lat"] = combined["lat"].astype("float64").round(2)
        combined["lon"] = combined["lon"].astype("float64").round(2)
    else:
        combined = pd.DataFrame(columns=["lat", "lon", "acq_date", "precip_mm"])
        log("  Semua batch gagal run ini -- 100% data yang disimpan berasal dari run sebelumnya.")

    if old_data is not None and len(old_data) > 0:
        old_data = old_data.copy()
        old_data["acq_date"] = pd.to_datetime(old_data["acq_date"])
        old_data["lat"] = old_data["lat"].astype("float64").round(2)
        old_data["lon"] = old_data["lon"].astype("float64").round(2)
        if len(combined) > 0:
            merged = pd.concat([old_data, combined], ignore_index=True)
            merged = merged.drop_duplicates(subset=["lat", "lon", "acq_date"], keep="last")
        else:
            merged = old_data
    else:
        merged = combined

    if merged.empty:
        log("Hasil akhir kosong (tidak ada data baru maupun lama). Berhenti tanpa menulis file.")
        raise SystemExit(1)

    n_cells_final = merged[["lat", "lon"]].drop_duplicates().shape[0]
    n_cells_this_shard = merged.merge(
        pd.DataFrame(points, columns=["lat", "lon"]), on=["lat", "lon"]
    )[["lat", "lon"]].drop_duplicates().shape[0]
    log(f"  Cakupan shard ini setelah fallback: {n_cells_this_shard:,} dari "
        f"{len(points):,} sel target shard ({n_cells_this_shard/max(1,len(points))*100:.1f}%)")
    log(f"  Cakupan grid darat NASIONAL (akumulasi semua shard sejauh ini): "
        f"{n_cells_final:,} dari {len(all_points):,} sel ({n_cells_final/len(all_points)*100:.1f}%)")

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    merged.to_parquet(OUT_PATH, index=False)
    log(f"Selesai. {len(merged):,} baris disimpan ke {OUT_PATH} "
        f"({merged.acq_date.min().date()} s/d {merged.acq_date.max().date()})")


if __name__ == "__main__":
    main()