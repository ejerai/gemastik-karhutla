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

import os
import time
from pathlib import Path
from datetime import datetime, timezone

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

PAST_DAYS = 4       # histori terkini (fitur lag/rolling >4 hari sudah tercakup
                     # oleh data yang terkumpul dari run-run sebelumnya, berkat
                     # merge-fallback di bawah -- lihat catatan N_SHARDS)
FORECAST_DAYS = 8   # proyeksi ke depan (dipakai fitur day_of_year/month masa depan)
BATCH_SIZE = 150    # jumlah titik koordinat per request (jaga URL tetap wajar)
# 1.5s dipilih supaya laju permintaan (dalam satuan "berat" kuota Open-Meteo,
# bukan cuma hitungan HTTP request) tetap di bawah limit 600/menit mereka.
# Lihat estimasi berat di log saat run -- kalau PAST_DAYS/FORECAST_DAYS diubah,
# nilai ini mungkin perlu disesuaikan lagi.
REQUEST_DELAY_SEC = 1.5

# --- PENJELASAN PENTING: kenapa harus di-shard, bukan fetch grid penuh tiap run ---
# Open-Meteo TIDAK menghitung 1 HTTP request = 1 kuota. Mereka pakai bobot:
#   weight = n_lokasi * (n_hari/14) * (n_variabel/10)
# Grid nasional (78.200 sel) x (PAST_DAYS+FORECAST_DAYS) hari dalam SATU run
# saja sudah jauh melebihi kuota harian gratis (10.000 unit) -- bukan soal sial
# kena limit, tapi secara matematis kuotanya memang tidak cukup untuk cakupan
# sebesar itu dalam 1x jalan. Solusinya: tiap run cuma minta 1/N_SHARDS dari
# grid nasional (giliran berputar otomatis berdasarkan jam UTC saat ini),
# sementara data lama untuk sel yang belum kebagian giliran tetap dipakai
# (lihat blok merge di main()). Dengan jadwal cron tiap 3 jam (8x/hari),
# seluruh negara akan ter-refresh penuh ~1x per hari secara bergilir --
# konsisten dengan filosofi "delay per beberapa jam itu oke" dari awal.
N_SHARDS = 8
SHARD_OVERRIDE_ENV = "FETCH_SHARD_OVERRIDE"  # override manual buat testing lokal


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


MAX_RETRIES = 3
RETRY_BACKOFF_SEC = 8  # dikali (percobaan ke-n) -- 8s, 16s, 24s


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
    # Interleaved slicing (bukan potongan blok berurutan) supaya tiap shard
    # tetap tersebar merata ke seluruh wilayah Indonesia, bukan cuma
    # menyapu 1 pita lintang tertentu per run.
    points = all_points[shard_idx::N_SHARDS]
    log(f"Shard hari ini: {shard_idx + 1}/{N_SHARDS} -- {len(points):,} dari "
        f"{len(all_points):,} sel grid nasional ({len(points)/max(1,len(all_points))*100:.1f}%)")
    log(f"Total titik grid shard ini: {len(points):,} ({len(points)//BATCH_SIZE + 1} batch)")

    est_weight = (len(points) // BATCH_SIZE + 1) * BATCH_SIZE * ((PAST_DAYS + FORECAST_DAYS) / 14) * (1 / 10)
    log(f"  Estimasi berat kuota run ini: ~{est_weight:,.0f} dari limit harian 10.000 "
        f"(rumus Open-Meteo: n_lokasi x hari/14 x variabel/10)")

    # Baca data hasil fetch run sebelumnya (kalau ada) -- dipakai sebagai
    # FALLBACK untuk sel grid yang gagal di-fetch kali ini, supaya sel itu
    # tetap muncul di dashboard (agak basi) alih-alih hilang total dari peta.
    # Sebelumnya file lama langsung ditimpa penuh tanpa fallback ini -- itu
    # yang bikin >90% grid nasional hilang dari peta setiap kali sebagian
    # besar batch gagal (mis. kena rate limit di tengah run).
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
        # Gabung: baris hasil fetch BARU menang kalau ada kombinasi
        # (lat, lon, acq_date) yang sama; baris LAMA dipertahankan untuk
        # kombinasi yang tidak berhasil di-fetch ulang kali ini.
        merged = pd.concat([old_data, combined], ignore_index=True)
        merged = merged.drop_duplicates(subset=["lat", "lon", "acq_date"], keep="last")
    else:
        merged = combined

    if merged.empty:
        log("Hasil akhir kosong (tidak ada data baru maupun lama). Berhenti tanpa menulis file.")
        raise SystemExit(1)

    n_cells_final = merged[["lat", "lon"]].drop_duplicates().shape[0]
    log(f"  Cakupan grid setelah digabung dengan fallback: {n_cells_final:,} dari "
        f"{len(points):,} sel target ({n_cells_final/len(points)*100:.1f}%)")

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    merged.to_parquet(OUT_PATH, index=False)
    log(f"Selesai. {len(merged):,} baris disimpan ke {OUT_PATH} "
        f"({merged.acq_date.min().date()} s/d {merged.acq_date.max().date()})")


if __name__ == "__main__":
    main()