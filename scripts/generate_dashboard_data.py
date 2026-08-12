#!/usr/bin/env python3
"""
Karhutla EWS — Pipeline generator dashboard_data.json
=======================================================
Menggabungkan data titik api NASA FIRMS (VIIRS/MODIS) dengan curah hujan
NASA GPM IMERG untuk SELURUH INDONESIA (bukan hanya Kalimantan), melatih
model XGBoost untuk memprediksi risiko karhutla per grid 0.1°, lalu
mengekspor satu file JSON (`public/dashboard_data.json`) yang menjadi
satu-satunya sumber data untuk `src/pages/index.astro`.

Input (folder ./data, relatif terhadap script ini):
  - fire_indonesia_gpm_aligned.csv  -> arsip hotspot FIRMS historis (label training)
  - fire_realtime_14d.csv           -> hotspot FIRMS 14 hari terakhir (near real-time)
  - gpm_indonesia_combined.parquet  -> grid curah hujan harian GPM IMERG, 0.1°, nasional

Output:
  - ../public/dashboard_data.json

Jalankan:
  python scripts/generate_dashboard_data.py
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import (
    confusion_matrix,
    roc_curve,
    auc,
    classification_report,
)
from xgboost import XGBClassifier

sys.path.insert(0, str(Path(__file__).parent))
from regions import classify_region_vectorized  # noqa: E402

# --------------------------------------------------------------------------
# Konfigurasi
# --------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR / "data"
if not DATA_DIR.exists():
    DATA_DIR = SCRIPT_DIR.parent / "data"
OUT_PATH = SCRIPT_DIR.parent / "public" / "dashboard_data.json"

GRID_STEP = 0.1
GRID_OFFSET = 0.05  # pusat sel grid GPM berakhiran .05

STATUS_THRESHOLDS = [
    (0.75, "SIAGA 1 (Sangat Bahaya)"),
    (0.50, "SIAGA 2 (Bahaya)"),
    (0.25, "Waspada"),
]
STATUS_SAFE = "Aman"

# Berapa banyak titik grid "Aman" yang dikirim ke peta (biar ringan di browser).
# Semua grid Waspada ke atas SELALU dikirim penuh (seluruh Indonesia).
SAFE_SAMPLE_RATE = 0.12
MAX_SAFE_POINTS = 9000

FEATURES = [
    "precip_mm", "precip_lag1", "precip_lag3", "precip_lag7",
    "precip_roll7", "precip_roll14", "lat_grid", "lon_grid",
    "day_of_year", "month",
]


def log(msg: str) -> None:
    print(f"[generate_dashboard_data] {msg}", flush=True)


def snap_to_grid(series: pd.Series) -> pd.Series:
    """Bulatkan koordinat ke pusat sel grid GPM (kelipatan 0.1°, offset .05)."""
    return (np.round((series - GRID_OFFSET) / GRID_STEP) * GRID_STEP + GRID_OFFSET).round(2)


def status_from_risk(risk: float) -> str:
    for thresh, name in STATUS_THRESHOLDS:
        if risk >= thresh:
            return name
    return STATUS_SAFE


def normalize_confidence(val) -> str:
    """Normalisasi kolom confidence FIRMS (VIIRS: n/l/h, MODIS: 0-100) -> nominal/low/high."""
    if pd.isna(val):
        return "nominal"
    s = str(val).strip().lower()
    if s in ("n", "nominal"):
        return "nominal"
    if s in ("l", "low"):
        return "low"
    if s in ("h", "high"):
        return "high"
    try:
        v = float(s)
        if v >= 80:
            return "high"
        if v < 30:
            return "low"
        return "nominal"
    except ValueError:
        return "nominal"


# --------------------------------------------------------------------------
# 1. Load data mentah
# --------------------------------------------------------------------------
def load_raw():
    log("Membaca data mentah...")
    fire_hist = pd.read_csv(DATA_DIR / "fire_indonesia_gpm_aligned.csv")
    fire_rt = pd.read_csv(DATA_DIR / "fire_realtime_14d.csv")
    gpm = pd.read_parquet(DATA_DIR / "gpm_indonesia_combined.parquet")

    fire_hist["acq_date"] = pd.to_datetime(fire_hist["acq_date"])
    fire_rt["acq_date"] = pd.to_datetime(fire_rt["acq_date"])
    gpm["acq_date"] = pd.to_datetime(gpm["acq_date"])
    gpm = gpm.rename(columns={"lat": "lat_grid", "lon": "lon_grid"})

    log(f"  fire historis : {len(fire_hist):,} baris "
        f"({fire_hist.acq_date.min().date()} s/d {fire_hist.acq_date.max().date()})")
    log(f"  fire realtime : {len(fire_rt):,} baris "
        f"({fire_rt.acq_date.min().date()} s/d {fire_rt.acq_date.max().date()})")
    log(f"  grid GPM      : {len(gpm):,} baris, "
        f"{gpm.lat_grid.nunique()}x{gpm.lon_grid.nunique()} sel, "
        f"{gpm.acq_date.nunique()} tanggal, seluruh Indonesia "
        f"(lat {gpm.lat_grid.min():.2f}..{gpm.lat_grid.max():.2f}, "
        f"lon {gpm.lon_grid.min():.2f}..{gpm.lon_grid.max():.2f})")
    return fire_hist, fire_rt, gpm


# --------------------------------------------------------------------------
# 2. Fitur curah hujan (lag & rolling) per sel grid, nasional
# --------------------------------------------------------------------------
def build_precip_features(gpm: pd.DataFrame) -> pd.DataFrame:
    log("Menghitung fitur curah hujan (lag/rolling) per sel grid nasional...")
    gpm = gpm.sort_values(["lat_grid", "lon_grid", "acq_date"]).reset_index(drop=True)
    grp = gpm.groupby(["lat_grid", "lon_grid"], sort=False)["precip_mm"]

    gpm["precip_lag1"] = grp.shift(1)
    gpm["precip_lag3"] = grp.shift(3)
    gpm["precip_lag7"] = grp.shift(7)
    gpm["precip_roll7"] = grp.transform(lambda s: s.shift(1).rolling(7, min_periods=1).mean())
    gpm["precip_roll14"] = grp.transform(lambda s: s.shift(1).rolling(14, min_periods=1).mean())

    for col in ["precip_lag1", "precip_lag3", "precip_lag7", "precip_roll7", "precip_roll14"]:
        gpm[col] = gpm[col].fillna(gpm["precip_mm"])

    gpm["day_of_year"] = gpm["acq_date"].dt.dayofyear
    gpm["month"] = gpm["acq_date"].dt.month
    return gpm


# --------------------------------------------------------------------------
# 3. Label fire_occurred per sel grid-hari dari arsip FIRMS historis
# --------------------------------------------------------------------------
def build_training_table(gpm_feat: pd.DataFrame, fire_hist: pd.DataFrame) -> pd.DataFrame:
    log("Menautkan hotspot historis ke grid GPM (spatial-temporal join) seluruh Indonesia...")
    fh = fire_hist.copy()
    fh["lat_grid"] = snap_to_grid(fh["latitude"])
    fh["lon_grid"] = snap_to_grid(fh["longitude"])
    fire_days = (
        fh.groupby(["lat_grid", "lon_grid", "acq_date"])
        .size()
        .reset_index(name="n_hotspot")
    )

    date_min, date_max = fire_hist.acq_date.min(), fire_hist.acq_date.max()
    train_grid = gpm_feat[(gpm_feat.acq_date >= date_min) & (gpm_feat.acq_date <= date_max)].copy()

    train_grid = train_grid.merge(
        fire_days, on=["lat_grid", "lon_grid", "acq_date"], how="left"
    )
    train_grid["fire_occurred"] = (train_grid["n_hotspot"].fillna(0) > 0).astype(int)

    n_pos = int(train_grid["fire_occurred"].sum())
    log(f"  tabel training: {len(train_grid):,} baris grid-hari, "
        f"{n_pos:,} positif ({n_pos/len(train_grid)*100:.2f}% kebakaran)")
    return train_grid


# --------------------------------------------------------------------------
# 4. Latih model XGBoost
# --------------------------------------------------------------------------
def train_model(train_grid: pd.DataFrame):
    log("Melatih model XGBoost...")
    df = train_grid.dropna(subset=FEATURES + ["fire_occurred"]).copy()
    dates_sorted = np.sort(df["acq_date"].unique())
    split_idx = int(len(dates_sorted) * 0.8)
    train_dates, test_dates = dates_sorted[:split_idx], dates_sorted[split_idx:]

    train_df = df[df.acq_date.isin(train_dates)]
    test_df = df[df.acq_date.isin(test_dates)]

    X_train, y_train = train_df[FEATURES], train_df["fire_occurred"]
    X_test, y_test = test_df[FEATURES], test_df["fire_occurred"]

    n_pos, n_neg = y_train.sum(), len(y_train) - y_train.sum()
    scale_pos_weight = max(1.0, n_neg / max(1, n_pos))

    model = XGBClassifier(
        n_estimators=300,
        max_depth=5,
        learning_rate=0.06,
        subsample=0.85,
        colsample_bytree=0.85,
        min_child_weight=3,
        scale_pos_weight=scale_pos_weight,
        eval_metric="auc",
        n_jobs=-1,
        random_state=42,
    )
    model.fit(X_train, y_train)

    y_proba = model.predict_proba(X_test)[:, 1]
    y_pred = (y_proba >= 0.5).astype(int)

    fpr, tpr, _ = roc_curve(y_test, y_proba)
    auc_roc = float(auc(fpr, tpr))
    cm = confusion_matrix(y_test, y_pred).tolist()
    report = classification_report(
        y_test, y_pred, target_names=["Tidak Terbakar", "Terbakar"],
        output_dict=True, zero_division=0,
    )

    # Sampling kurva ROC ke ~25 titik supaya JSON tidak membengkak
    idx = np.linspace(0, len(fpr) - 1, min(25, len(fpr))).astype(int)
    roc_curve_sampled = {"fpr": fpr[idx].round(4).tolist(), "tpr": tpr[idx].round(4).tolist()}

    importance = model.feature_importances_
    order = np.argsort(importance)[::-1]
    feature_importance = [
        {"feature": FEATURES[i], "importance": float(round(importance[i], 4))}
        for i in order
    ]

    log(f"  AUC-ROC (test): {auc_roc:.3f} | akurasi: {report['accuracy']:.3f}")

    model_block = {
        "auc_roc": round(auc_roc, 3),
        "confusion_matrix": cm,
        "roc_curve": roc_curve_sampled,
        "classification_report": {
            "Tidak Terbakar": {
                "precision": round(report["Tidak Terbakar"]["precision"], 3),
                "recall": round(report["Tidak Terbakar"]["recall"], 3),
                "f1-score": round(report["Tidak Terbakar"]["f1-score"], 3),
                "support": int(report["Tidak Terbakar"]["support"]),
            },
            "Terbakar": {
                "precision": round(report["Terbakar"]["precision"], 3),
                "recall": round(report["Terbakar"]["recall"], 3),
                "f1-score": round(report["Terbakar"]["f1-score"], 3),
                "support": int(report["Terbakar"]["support"]),
            },
            "accuracy": round(report["accuracy"], 3),
        },
        "feature_importance": feature_importance,
    }

    eda_block = build_eda(df)
    return model, model_block, eda_block


def build_eda(df: pd.DataFrame) -> dict:
    box = {}
    for key, sub in [("no_fire", df[df.fire_occurred == 0]), ("fire", df[df.fire_occurred == 1])]:
        q1, med, q3 = sub["precip_roll7"].quantile([0.25, 0.5, 0.75])
        box[key] = {"q1": round(float(q1), 2), "median": round(float(med), 2), "q3": round(float(q3), 2)}

    corr_cols = ["fire_occurred", "precip_mm", "precip_lag1", "precip_lag3",
                 "precip_lag7", "precip_roll7", "precip_roll14"]
    corr = df[corr_cols].corr().round(2)
    return {
        "precip_roll7_box": box,
        "correlation": {
            "columns": corr_cols,
            "matrix": corr.values.tolist(),
        },
    }


# --------------------------------------------------------------------------
# 5. Prediksi risiko nasional untuk tanggal target (EWS)
# --------------------------------------------------------------------------
def build_ews(model, gpm_feat: pd.DataFrame, target_date: pd.Timestamp):
    log(f"Menghitung peta risiko nasional untuk tanggal target {target_date.date()}...")
    today = gpm_feat[gpm_feat.acq_date == target_date].dropna(subset=FEATURES).copy()
    if today.empty:
        raise RuntimeError("Tidak ada data grid GPM pada tanggal target.")

    today["risk_score"] = model.predict_proba(today[FEATURES])[:, 1]
    today["region"] = classify_region_vectorized(today["lat_grid"], today["lon_grid"])
    today["status"] = today["risk_score"].apply(status_from_risk)

    status_summary = today["status"].value_counts().to_dict()
    for _, name in STATUS_THRESHOLDS:
        status_summary.setdefault(name, 0)
    status_summary.setdefault(STATUS_SAFE, 0)

    region_summary = {}
    for region, sub in today.groupby("region"):
        region_summary[region] = sub["status"].value_counts().to_dict()

    # Semua grid Waspada+ dikirim penuh (nasional), grid Aman disampel merata.
    hazard_mask = today["status"] != STATUS_SAFE
    hazard_pts = today[hazard_mask]
    safe_pts = today[~hazard_mask]
    n_safe_sample = min(MAX_SAFE_POINTS, int(len(safe_pts) * SAFE_SAMPLE_RATE))
    safe_sample = safe_pts.sample(n=n_safe_sample, random_state=42) if n_safe_sample > 0 else safe_pts.iloc[0:0]

    map_df = pd.concat([hazard_pts, safe_sample]).sort_values("risk_score", ascending=False)

    map_points = [
        {
            "lat": round(float(r.lat_grid), 2),
            "lon": round(float(r.lon_grid), 2),
            "region": r.region,
            "precip_mm": round(float(r.precip_mm), 1),
            "precip_roll7": round(float(r.precip_roll7), 1),
            "risk_score": round(float(r.risk_score), 2),
            "status": r.status,
        }
        for r in map_df.itertuples(index=False)
    ]

    top_hazard = [
        {
            "lat": round(float(r.lat_grid), 2),
            "lon": round(float(r.lon_grid), 2),
            "region": r.region,
            "precip_mm": round(float(r.precip_mm), 1),
            "precip_roll7": round(float(r.precip_roll7), 1),
            "risk_score": round(float(r.risk_score), 2),
            "status": r.status,
        }
        for r in today.sort_values("risk_score", ascending=False).head(20).itertuples(index=False)
    ]

    mean_risk = float(today["risk_score"].mean())

    ews_block = {
        "target_date": target_date.strftime("%Y-%m-%d"),
        "region_name": "Indonesia",
        "mean_risk": round(mean_risk, 3),
        "status_summary": status_summary,
        "region_summary": region_summary,
        "top_hazard": top_hazard,
        "map_points": map_points,
        "map_points_total_grid": int(len(today)),
        "map_points_sent": int(len(map_points)),
    }
    return ews_block, today


def build_projection(gpm_feat: pd.DataFrame, model, target_date: pd.Timestamp, days: int = 8):
    """Proyeksi 8 hari ke depan: ekstrapolasi tren curah hujan grid nasional
    berdasarkan tren 14 hari terakhir, lalu jalankan model pada fitur hasil
    ekstrapolasi tsb untuk memperkirakan tren risiko & jumlah grid SIAGA 1."""
    log(f"Membuat proyeksi risiko {days} hari ke depan...")
    window_start = target_date - pd.Timedelta(days=13)
    recent = gpm_feat[(gpm_feat.acq_date >= window_start) & (gpm_feat.acq_date <= target_date)]
    recent = recent.dropna(subset=FEATURES)

    base = gpm_feat[gpm_feat.acq_date == target_date].dropna(subset=FEATURES).copy()
    # tren harian precip_roll7 nasional (mm/hari) dari regresi linear sederhana
    daily_mean = recent.groupby("acq_date")["precip_roll7"].mean()
    if len(daily_mean) >= 2:
        x = np.arange(len(daily_mean))
        slope = float(np.polyfit(x, daily_mean.values, 1)[0])
    else:
        slope = 0.0

    projection = []
    labels_id = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"]
    for i in range(days):
        step = base.copy()
        decay = max(0.0, 1 - i * 0.03)
        step["precip_roll7"] = (step["precip_roll7"] + slope * (i + 1)).clip(lower=0) * decay + step["precip_roll7"] * (1 - decay)
        step["precip_roll14"] = (step["precip_roll14"] + slope * (i + 1) * 0.6).clip(lower=0)
        step["precip_mm"] = (step["precip_mm"] + slope * (i + 1)).clip(lower=0)
        step["precip_lag1"] = step["precip_mm"]
        step["precip_lag3"] = step["precip_roll7"]
        step["precip_lag7"] = step["precip_roll7"]
        future_date = target_date + pd.Timedelta(days=i + 1)
        step["day_of_year"] = future_date.dayofyear
        step["month"] = future_date.month

        risk = model.predict_proba(step[FEATURES])[:, 1]
        mean_risk = float(np.mean(risk))
        siaga1_count = int((risk >= 0.75).sum())
        projection.append({
            "date": f"{future_date.day:02d} {labels_id[future_date.month - 1]}",
            "mean_risk": round(mean_risk, 2),
            "siaga1_count": siaga1_count,
        })
    return projection


# --------------------------------------------------------------------------
# 6. Ringkasan nasional (tren harian, distribusi regional, confidence, dll)
# --------------------------------------------------------------------------
def build_national(fire_hist: pd.DataFrame, fire_rt: pd.DataFrame):
    log("Menyusun ringkasan nasional (30 hari terakhir + arsip)...")
    fh = fire_hist.copy()
    fh["region"] = classify_region_vectorized(fh["latitude"], fh["longitude"])
    fh["confidence_norm"] = fh["confidence"].apply(normalize_confidence)

    rt = fire_rt.copy()
    rt["region"] = classify_region_vectorized(rt["latitude"], rt["longitude"])
    rt["confidence_norm"] = rt["confidence"].apply(normalize_confidence)

    combined = pd.concat([
        fh[["acq_date", "region", "confidence_norm", "daynight", "satellite"]],
        rt[["acq_date", "region", "confidence_norm", "daynight", "satellite"]],
    ], ignore_index=True)

    max_date = combined["acq_date"].max()
    last30 = combined[combined.acq_date >= max_date - pd.Timedelta(days=29)]
    daily_trend = (
        last30.groupby(last30["acq_date"].dt.strftime("%Y-%m-%d")).size()
        .reindex(pd.date_range(max_date - pd.Timedelta(days=29), max_date).strftime("%Y-%m-%d"), fill_value=0)
        .reset_index()
    )
    daily_trend.columns = ["date", "count"]

    regional = (
        combined.groupby("region").size().sort_values(ascending=False)
        .reset_index(name="count").rename(columns={"region": "region"})
    )

    confidence = combined["confidence_norm"].value_counts().to_dict()
    for k in ("nominal", "low", "high"):
        confidence.setdefault(k, 0)
    confidence = {"nominal": confidence["nominal"], "low": confidence["low"], "high": confidence["high"]}

    daynight_map = {"D": "day", "N": "night"}
    dn_counts = combined["daynight"].map(daynight_map).value_counts().to_dict()
    daynight = {"day": int(dn_counts.get("day", 0)), "night": int(dn_counts.get("night", 0))}

    sat_counts = combined["satellite"].value_counts()
    top_sat = sat_counts.head(3)
    other = int(sat_counts.iloc[3:].sum())
    satellite = {str(k): int(v) for k, v in top_sat.items()}
    if other > 0:
        satellite["Lainnya"] = other

    return {
        "daily_trend": daily_trend.to_dict("records"),
        "regional": regional.to_dict("records"),
        "confidence": confidence,
        "daynight": daynight,
        "satellite": satellite,
    }, combined


# --------------------------------------------------------------------------
# 7. Blok realtime (hotspot terbaru + area rawan kekeringan)
# --------------------------------------------------------------------------
def build_realtime(fire_rt: pd.DataFrame, gpm_feat: pd.DataFrame, target_date: pd.Timestamp):
    log("Menyusun blok realtime (hotspot terbaru & area kering)...")
    rt = fire_rt.dropna(subset=["frp"]).copy()
    rt["region"] = classify_region_vectorized(rt["latitude"], rt["longitude"])
    rt["confidence_norm"] = rt["confidence"].apply(normalize_confidence)
    rt["daynight_id"] = rt["daynight"].map({"D": "Siang", "N": "Malam"}).fillna("Siang")

    recent = rt.sort_values("frp", ascending=False).head(40)
    recent_records = [
        {
            "date": r.acq_date.strftime("%Y-%m-%d"),
            "lat": round(float(r.latitude), 3),
            "lon": round(float(r.longitude), 3),
            "frp": round(float(r.frp), 1),
            "confidence": r.confidence_norm,
            "daynight": r.daynight_id,
            "region": r.region,
        }
        for r in recent.itertuples(index=False)
    ]

    today_grid = gpm_feat[gpm_feat.acq_date == target_date].dropna(subset=["precip_roll14"]).copy()
    today_grid["region"] = classify_region_vectorized(today_grid["lat_grid"], today_grid["lon_grid"])
    # Exclude fallback "Lainnya" (Nusa Tenggara/Maluku/area luar box pulau utama)
    # SEBELUM ambil top 15 terkering, supaya kartu selalu menampilkan 15 grid
    # dari wilayah yang teridentifikasi jelas, bukan sisa slot yang nanti
    # dibuang di frontend (yang bisa bikin baris tampil < 15).
    drought_top = (
        today_grid[today_grid["region"] != "Lainnya"]
        .sort_values("precip_roll14")
        .head(15)
    )
    drought_records = [
        {
            "lat": round(float(r.lat_grid), 2),
            "lon": round(float(r.lon_grid), 2),
            "precip_roll14": round(float(r.precip_roll14), 1),
            "region": r.region,
        }
        for r in drought_top.itertuples(index=False)
    ]

    return {
        "last_updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S"),
        "recent": recent_records,
        "drought_top": drought_records,
    }


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------
def main():
    fire_hist, fire_rt, gpm = load_raw()
    gpm_feat = build_precip_features(gpm)
    train_grid = build_training_table(gpm_feat, fire_hist)
    model, model_block, eda_block = train_model(train_grid)

    target_date = gpm_feat["acq_date"].max()
    ews_block, today_grid = build_ews(model, gpm_feat, target_date)
    ews_block["projection"] = build_projection(gpm_feat, model, target_date)

    national_block, combined_fire = build_national(fire_hist, fire_rt)
    realtime_block = build_realtime(fire_rt, gpm_feat, target_date)

    total_hotspots = int(len(fire_hist) + len(fire_rt))
    fire_grid_days = int(len(train_grid))
    fire_start = min(fire_hist.acq_date.min(), fire_rt.acq_date.min()).strftime("%Y-%m-%d")
    fire_end = max(fire_hist.acq_date.max(), fire_rt.acq_date.max()).strftime("%Y-%m-%d")

    dashboard = {
        "meta": {
            "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S"),
            "fire_start": fire_start,
            "fire_end": fire_end,
            "total_hotspots": total_hotspots,
            "fire_grid_days": fire_grid_days,
            "coverage": "Indonesia (Nasional)",
        },
        "model": model_block,
        "eda": eda_block,
        "national": national_block,
        "ews": ews_block,
        "realtime": realtime_block,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(dashboard, f, ensure_ascii=False, separators=(",", ":"))

    size_kb = OUT_PATH.stat().st_size / 1024
    log(f"Selesai. {OUT_PATH} ({size_kb:.0f} KB)")
    log(f"  Total grid nasional hari ini : {len(today_grid):,} sel "
        f"({today_grid.region.nunique()} wilayah)")
    log(f"  Grid dikirim ke peta         : {ews_block['map_points_sent']:,} "
        f"dari {ews_block['map_points_total_grid']:,}")
    log(f"  Distribusi status            : {ews_block['status_summary']}")


if __name__ == "__main__":
    main()