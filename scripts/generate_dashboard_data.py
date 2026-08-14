#!/usr/bin/env python3
"""
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
    precision_recall_curve,
    average_precision_score,
)
from xgboost import XGBClassifier

sys.path.insert(0, str(Path(__file__).parent))
from regions import classify_region_vectorized  # noqa: E402

# Konfigurasi
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

SAFE_SAMPLE_RATE = 0.12
MAX_SAFE_POINTS = 9000

FEATURES = [
    "precip_mm", "precip_lag1", "precip_lag3", "precip_lag7",
    "precip_roll7", "precip_roll14", "lat_grid", "lon_grid",
    "day_of_year", "month",
]
# grid_fire_history SENGAJA TIDAK dimasukkan ke FEATURES classifier. Dites
# langsung: kalau dimasukkan, XGBoost men-split >50% keputusan di fitur ini
# (karena cuma ~7.5% grid nasional yang pernah tercatat kebakaran di arsip
# 2 bulan), sehingga 92.5% wilayah lain otomatis dianggap "aman" TIDAK PEDULI
# sekering apa pun curah hujannya hari ini -- peta jadi cuma "napak tilas"
# lokasi lama, bukan peringatan dini yang reaktif. Solusinya: model dilatih
# HANYA dari curah hujan+lokasi+waktu (reaktif ke kondisi hari ini), lalu
# grid_fire_history digabung belakangan lewat blend_history_boost() sebagai
# pendorong risiko di lokasi historis rawan -- bukan penentu tunggal.
HISTORY_BOOST_WEIGHT = 0.45  # kontribusi maksimum riwayat lokasi ke risk_score akhir
HISTORY_BOOST_SATURATION = 3.0  # makin kecil, makin cepat "penuh" (0,1,2,3x kejadian dulu)


def blend_history_boost(proba: np.ndarray, history_raw: np.ndarray) -> np.ndarray:
    """Gabungkan probabilitas model dinamis (reaksi ke curah hujan HARI INI)
    dengan propensity dari riwayat kebakaran lokasi, gaya noisy-OR: risiko naik
    kalau kondisi hari ini genting ATAU lokasinya historis rawan -- tapi tidak
    ada satu sinyal yang bisa membungkam sinyal lainnya sepenuhnya (beda dengan
    dulu, waktu grid_fire_history jadi fitur classifier dan mendominasi total)."""
    history_propensity = history_raw / (history_raw + HISTORY_BOOST_SATURATION)
    return 1 - (1 - proba) * (1 - HISTORY_BOOST_WEIGHT * history_propensity)


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

# 1. Load data mentah
def load_raw():
    log("Membaca data mentah...")
    fire_hist = pd.read_csv(DATA_DIR / "fire_indonesia_gpm_aligned.csv")
    fire_rt = pd.read_csv(DATA_DIR / "fire_realtime_14d.csv")
    gpm = pd.read_parquet(DATA_DIR / "gpm_indonesia_combined.parquet")

    fire_hist["acq_date"] = pd.to_datetime(fire_hist["acq_date"])
    fire_rt["acq_date"] = pd.to_datetime(fire_rt["acq_date"])
    gpm["acq_date"] = pd.to_datetime(gpm["acq_date"])
    gpm = gpm.rename(columns={"lat": "lat_grid", "lon": "lon_grid"})
    # PENTING: kolom lat/lon di parquet GPM tersimpan sebagai float32.
    # float32(-10.95) sebenarnya bernilai -10.949999809265137 saat di-upcast ke
    # float64, jadi merge langsung terhadap grid float64 dari data fire (yang
    # sudah dibulatkan .round(2)) akan gagal match untuk >95% baris. Cast eksplisit
    # ke float64 lalu bulatkan ke 2 desimal supaya representasinya identik.
    gpm["lat_grid"] = gpm["lat_grid"].astype("float64").round(2)
    gpm["lon_grid"] = gpm["lon_grid"].astype("float64").round(2)

    # Kalau ada tambalan data curah hujan real-time (hasil fetch_rainfall_openmeteo.py),
    # gabungkan di atas arsip: untuk tanggal yang overlap, versi real-time menang
    # (karena lebih baru & sudah termasuk beberapa hari proyeksi ke depan).
    realtime_path = DATA_DIR / "gpm_realtime_recent.parquet"
    if realtime_path.exists():
        rt_gpm = pd.read_parquet(realtime_path)
        rt_gpm["acq_date"] = pd.to_datetime(rt_gpm["acq_date"])
        rt_gpm = rt_gpm.rename(columns={"lat": "lat_grid", "lon": "lon_grid"})
        rt_gpm["lat_grid"] = rt_gpm["lat_grid"].astype("float64").round(2)
        rt_gpm["lon_grid"] = rt_gpm["lon_grid"].astype("float64").round(2)
        # concat lalu drop_duplicates(keep="last"): baris dari rt_gpm (ditaruh
        # belakang) menang untuk kombinasi (grid, tanggal) yang overlap dengan arsip.
        gpm = pd.concat([gpm, rt_gpm], ignore_index=True)
        gpm = gpm.drop_duplicates(subset=["lat_grid", "lon_grid", "acq_date"], keep="last")
        log(f"  tambalan realtime GPM ditemukan: {len(rt_gpm):,} baris "
            f"({rt_gpm.acq_date.min().date()} s/d {rt_gpm.acq_date.max().date()}) -- digabung ke arsip")

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

# 2. Fitur curah hujan (lag & rolling) per sel grid, nasional
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

# 2b. Fitur riwayat kebakaran per sel grid (rekurensi lokasi rawan, mis. gambut)
def build_fire_history_feature(gpm_feat: pd.DataFrame, fire_hist: pd.DataFrame,
                                fire_rt: pd.DataFrame) -> pd.DataFrame:
    """Hitung jumlah kumulatif hari-hari SEBELUM tanggal berjalan di mana sel grid
    yang sama pernah terpantau titik api (arsip historis + realtime). Lokasi yang
    berulang kali terbakar (mis. lahan gambut) akan punya nilai lebih tinggi.
    Pakai shift(1) supaya kejadian hari itu sendiri tidak ikut terhitung (no leakage)."""
    log("Menghitung fitur riwayat kebakaran per sel grid (anti data-leakage)...")
    combined = pd.concat([
        fire_hist[["latitude", "longitude", "acq_date"]],
        fire_rt[["latitude", "longitude", "acq_date"]],
    ], ignore_index=True)
    combined["lat_grid"] = snap_to_grid(combined["latitude"])
    combined["lon_grid"] = snap_to_grid(combined["longitude"])
    fire_flag = (
        combined.groupby(["lat_grid", "lon_grid", "acq_date"]).size()
        .reset_index(name="n_hotspot")
    )
    fire_flag["fire_flag"] = 1.0

    gpm_feat = gpm_feat.merge(
        fire_flag[["lat_grid", "lon_grid", "acq_date", "fire_flag"]],
        on=["lat_grid", "lon_grid", "acq_date"], how="left",
    )
    gpm_feat["fire_flag"] = gpm_feat["fire_flag"].fillna(0.0)
    gpm_feat = gpm_feat.sort_values(["lat_grid", "lon_grid", "acq_date"]).reset_index(drop=True)
    grp = gpm_feat.groupby(["lat_grid", "lon_grid"], sort=False)["fire_flag"]
    gpm_feat["grid_fire_history"] = grp.transform(lambda s: s.shift(1).fillna(0).cumsum())
    gpm_feat = gpm_feat.drop(columns=["fire_flag"])
    return gpm_feat


# 3. Label fire_occurred per sel grid-hari dari arsip FIRMS historis
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

# 4. Latih model XGBoost
def train_model(train_grid: pd.DataFrame):
    log("Melatih model XGBoost...")
    df = train_grid.dropna(subset=FEATURES + ["fire_occurred"]).copy()
    dates_sorted = np.sort(df["acq_date"].unique())
    split_idx = int(len(dates_sorted) * 0.8)
    train_dates, test_dates = dates_sorted[:split_idx], dates_sorted[split_idx:]

    train_df = df[df.acq_date.isin(train_dates)]
    test_df = df[df.acq_date.isin(test_dates)]

    # Sisihkan 15% tanggal TERAKHIR dari periode training sebagai validation set,
    # murni untuk memilih ambang keputusan (threshold) -- supaya test set tetap
    # "belum pernah dilihat" sama sekali saat threshold dipilih (hindari kebocoran).
    val_split_idx = int(len(train_dates) * 0.85)
    fit_dates, val_dates = train_dates[:val_split_idx], train_dates[val_split_idx:]
    fit_df = df[df.acq_date.isin(fit_dates)]
    val_df = df[df.acq_date.isin(val_dates)]

    X_train, y_train = train_df[FEATURES], train_df["fire_occurred"]
    X_test, y_test = test_df[FEATURES], test_df["fire_occurred"]
    X_fit, y_fit = fit_df[FEATURES], fit_df["fire_occurred"]
    X_val, y_val = val_df[FEATURES], val_df["fire_occurred"]

    n_pos, n_neg = y_train.sum(), len(y_train) - y_train.sum()
    scale_pos_weight = max(1.0, n_neg / max(1, n_pos))

    model_kwargs = dict(
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

    # 1) Model sementara dilatih tanpa validation window, dipakai HANYA untuk
    #    memilih threshold (maksimalkan F2) di data yang belum pernah dilatih.
    #    Threshold dipilih di atas skor GABUNGAN (model dinamis + history boost)
    #    karena itu yang benar-benar dipakai untuk status di peta, bukan cuma
    #    output mentah model.
    val_model = XGBClassifier(**model_kwargs)
    val_model.fit(X_fit, y_fit)
    val_proba_dynamic = val_model.predict_proba(X_val)[:, 1]
    val_proba = blend_history_boost(val_proba_dynamic, val_df["grid_fire_history"].to_numpy())
    prec_v, rec_v, thresh_v = precision_recall_curve(y_val, val_proba)
    # F2 (beta=2): bobot recall 2x lipat dari presisi. Untuk sistem peringatan DINI,
    # kebakaran yang terlewat (false negative) jauh lebih mahal daripada alarm palsu
    # (false positive) -- jadi threshold sengaja dipilih lebih "murah hati" ke recall
    # dibanding F1 murni.
    beta = 2.0
    f2_v = (1 + beta**2) * prec_v * rec_v / ((beta**2 * prec_v) + rec_v + 1e-9)
    best_i = int(np.argmax(f2_v[:-1])) if len(thresh_v) else 0
    decision_threshold = float(thresh_v[best_i]) if len(thresh_v) else 0.5
    log(f"  threshold hasil tuning (val, F2-optimal, prioritas recall): {decision_threshold:.3f} "
        f"(presisi={prec_v[best_i]:.3f}, recall={rec_v[best_i]:.3f})")

    # 2) Model final dilatih ulang pakai SELURUH periode training (fit+val)
    #    seperti semula, lalu dievaluasi di test set memakai threshold di atas.
    model = XGBClassifier(**model_kwargs)
    model.fit(X_train, y_train)

    y_proba_dynamic = model.predict_proba(X_test)[:, 1]
    y_proba = blend_history_boost(y_proba_dynamic, test_df["grid_fire_history"].to_numpy())
    y_pred = (y_proba >= decision_threshold).astype(int)

    fpr, tpr, _ = roc_curve(y_test, y_proba)
    auc_roc = float(auc(fpr, tpr))
    pr_auc = float(average_precision_score(y_test, y_proba))
    baseline_pr = float(y_test.mean())
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
        "pr_auc": round(pr_auc, 3),
        "pr_auc_baseline": round(baseline_pr, 4),
        "decision_threshold": round(decision_threshold, 3),
        "class_balance_note": (
            f"Kejadian kebakaran sangat langka dibanding total grid-hari "
            f"({baseline_pr*100:.2f}% positif pada test set), jadi akurasi keseluruhan "
            f"secara alami tinggi meski model belum sempurna. PR-AUC "
            f"({round(pr_auc, 3)}) dan presisi/recall kelas 'Terbakar' adalah ukuran "
            f"yang lebih jujur untuk kasus imbalance seperti ini dibanding akurasi "
            f"atau AUC-ROC saja."
        ),
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

def resolve_target_date(gpm_feat: pd.DataFrame) -> pd.Timestamp:
    """Tentukan tanggal analisis 'HARI INI' yang sesungguhnya.

    gpm_feat bisa berisi hari-hari FORECAST (proyeksi cuaca Open-Meteo ke
    depan, lihat fetch_rainfall_openmeteo.py: FORECAST_DAYS=8) yang tercampur
    lewat gpm_realtime_recent.parquet. Kalau kita asal ambil
    gpm_feat['acq_date'].max(), dashboard bisa menampilkan status "risiko HARI
    INI" padahal itu sebenarnya proyeksi 7-8 hari ke depan berbasis prakiraan
    cuaca (bukan observasi aktual) -- dua lapis ketidakpastian yang
    disamarkan seolah status pasti hari ini. Fix: batasi ke tanggal grid
    terakhir yang TIDAK melebihi tanggal kalender aktual saat pipeline
    dijalankan."""
    today_real = pd.Timestamp(datetime.now(timezone.utc).date())
    available = np.sort(gpm_feat["acq_date"].unique())
    past_or_today = available[available <= np.datetime64(today_real)]
    if len(past_or_today) > 0:
        resolved = pd.Timestamp(past_or_today.max())
        log(f"  Tanggal analisis (hari ini): {resolved.date()} "
            f"(kalender aktual: {today_real.date()})")
        return resolved
    # Fallback ekstrem: seharusnya nyaris tidak pernah kejadian (PAST_DAYS=16
    # di fetch_rainfall_openmeteo.py selalu mencakup hari ini), tapi kalau
    # semua data grid entah kenapa ada di masa depan, pakai yang paling awal
    # -- lebih aman daripada diam-diam pakai tanggal paling jauh ke depan.
    log("  PERINGATAN: tidak ada data grid pada/sebelum tanggal kalender aktual, "
        "fallback ke tanggal grid paling awal yang tersedia.")
    return pd.Timestamp(available.min())


# 5. Prediksi risiko nasional untuk tanggal target (EWS)
def build_ews(model, gpm_feat: pd.DataFrame, target_date: pd.Timestamp):
    log(f"Menghitung peta risiko nasional untuk tanggal target {target_date.date()}...")
    today = gpm_feat[gpm_feat.acq_date == target_date].dropna(subset=FEATURES).copy()
    if today.empty:
        raise RuntimeError("Tidak ada data grid GPM pada tanggal target.")

    today["risk_score"] = blend_history_boost(
        model.predict_proba(today[FEATURES])[:, 1],
        today["grid_fire_history"].to_numpy(),
    )
    today["region"] = classify_region_vectorized(today["lat_grid"], today["lon_grid"])
    today["status"] = today["risk_score"].apply(status_from_risk)

    status_summary = today["status"].value_counts().to_dict()
    for _, name in STATUS_THRESHOLDS:
        status_summary.setdefault(name, 0)
    status_summary.setdefault(STATUS_SAFE, 0)

    region_summary = {}
    for region, sub in today.groupby("region"):
        region_summary[region] = sub["status"].value_counts().to_dict()

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
    n_forecast_days = 0
    for i in range(days):
        future_date = target_date + pd.Timedelta(days=i + 1)

        # PRIORITASKAN data forecast ASLI (Open-Meteo forecast_days, lihat
        # fetch_rainfall_openmeteo.py) kalau baris grid untuk tanggal ini
        # sudah tersedia -- jauh lebih akurat daripada menebak lewat
        # ekstrapolasi tren linear. Ekstrapolasi cuma dipakai sebagai
        # fallback untuk hari-hari di luar cakupan forecast yang tersedia.
        actual = gpm_feat[gpm_feat.acq_date == future_date].dropna(subset=FEATURES)
        if len(actual) > 0:
            step = actual
            source = "forecast"
            n_forecast_days += 1
        else:
            step = base.copy()
            decay = max(0.0, 1 - i * 0.03)
            step["precip_roll7"] = (step["precip_roll7"] + slope * (i + 1)).clip(lower=0) * decay + step["precip_roll7"] * (1 - decay)
            step["precip_roll14"] = (step["precip_roll14"] + slope * (i + 1) * 0.6).clip(lower=0)
            step["precip_mm"] = (step["precip_mm"] + slope * (i + 1)).clip(lower=0)
            step["precip_lag1"] = step["precip_mm"]
            step["precip_lag3"] = step["precip_roll7"]
            step["precip_lag7"] = step["precip_roll7"]
            step["day_of_year"] = future_date.dayofyear
            step["month"] = future_date.month
            source = "extrapolasi"

        risk = blend_history_boost(
            model.predict_proba(step[FEATURES])[:, 1],
            step["grid_fire_history"].to_numpy(),
        )
        mean_risk = float(np.mean(risk))
        siaga1_count = int((risk >= 0.75).sum())
        projection.append({
            "date": f"{future_date.day:02d} {labels_id[future_date.month - 1]}",
            "mean_risk": round(mean_risk, 2),
            "siaga1_count": siaga1_count,
            "source": source,
        })
    log(f"  Proyeksi: {n_forecast_days}/{days} hari pakai data forecast asli, "
        f"sisanya ekstrapolasi tren.")
    return projection

# 6. Ringkasan nasional (tren harian, distribusi regional, confidence, dll)
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

# 7. Blok realtime (hotspot terbaru + area rawan kekeringan)
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


# main
def main():
    fire_hist, fire_rt, gpm = load_raw()
    gpm_feat = build_precip_features(gpm)
    gpm_feat = build_fire_history_feature(gpm_feat, fire_hist, fire_rt)
    train_grid = build_training_table(gpm_feat, fire_hist)
    model, model_block, eda_block = train_model(train_grid)

    target_date = resolve_target_date(gpm_feat)
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
            "analysis_date": target_date.strftime("%Y-%m-%d"),
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