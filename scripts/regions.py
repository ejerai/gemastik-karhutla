"""
Klasifikasi wilayah (region) berdasarkan koordinat lat/lon, dipakai untuk
mengelompokkan titik api & grid risiko ke pulau/wilayah besar Indonesia.

Pendekatan: point-in-polygon sederhana pakai bounding box per pulau utama,
dengan pengecualian untuk memisahkan Kalimantan vs Sumatra vs Sulawesi yang
berdekatan, dan fallback "Lainnya" (Nusa Tenggara, Maluku, dan area laut/
perbatasan yang tidak masuk box manapun).

Referensi kasar batas wilayah (lat, lon dalam derajat desimal):
  Sumatra      : lon  95.0 - 106.5, lat  -6.2 -  6.2
  Jawa         : lon 105.0 - 114.9, lat -9.0  - -5.5
  Kalimantan   : lon 108.5 - 119.3, lat -4.3  -  7.5
  Sulawesi     : lon 118.7 - 125.5, lat -6.2  -  2.3
  Papua        : lon 130.0 - 141.5, lat -9.5  -  0.5 (termasuk Papua Barat)
  Lainnya      : Nusa Tenggara, Maluku, Kep. Riau luar, dll (fallback)
"""

REGION_BOXES = [
    ("Sumatra",         94.5, 106.6,  -6.3,   6.3),
    ("Jawa",           105.0, 115.0,  -9.2,  -5.4),
    ("Bali & Nusa Tenggara", 114.3, 125.6, -11.2, -7.8),
    ("Kalimantan",     108.5, 119.4,  -4.5,   7.6),
    ("Sulawesi",       118.6, 125.6,  -6.3,   2.4),
    ("Papua",          130.0, 141.6,  -9.6,   0.6),
    ("Maluku",         124.0, 135.6,  -8.6,   3.5),
]


def classify_region(lat: float, lon: float) -> str:
    if lat is None or lon is None:
        return "Lainnya"
    for name, lon_min, lon_max, lat_min, lat_max in REGION_BOXES:
        if lon_min <= lon <= lon_max and lat_min <= lat <= lat_max:
            return name
    return "Lainnya"


def classify_region_vectorized(lat_series, lon_series):
    """Versi vektor (pandas Series) -> pandas Series string region."""
    import numpy as np
    import pandas as pd

    out = pd.Series(["Lainnya"] * len(lat_series), index=lat_series.index)
    assigned = pd.Series(False, index=lat_series.index)
    for name, lon_min, lon_max, lat_min, lat_max in REGION_BOXES:
        mask = (~assigned) & (lon_series >= lon_min) & (lon_series <= lon_max) & \
               (lat_series >= lat_min) & (lat_series <= lat_max)
        out[mask] = name
        assigned = assigned | mask
    return out
