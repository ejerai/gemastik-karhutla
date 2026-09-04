"""
sumber data: GADM v3.6 admin level 0, lihat data/indonesia_boundary.geojson.
"""
from __future__ import annotations

import json
from pathlib import Path
from functools import lru_cache

import numpy as np
from shapely.geometry import shape
from shapely.validation import make_valid

SCRIPT_DIR = Path(__file__).parent
BOUNDARY_PATH = SCRIPT_DIR.parent / "data" / "indonesia_boundary.geojson"


@lru_cache(maxsize=1)
def _load_geometry():
    """load & cache poligon batas Indonesia sekali per proses."""
    with open(BOUNDARY_PATH, "r", encoding="utf-8") as f:
        gj = json.load(f)
    geom = shape(gj["features"][0]["geometry"])
    if not geom.is_valid:
        geom = make_valid(geom)
    return geom


def is_indonesia(lat, lon) -> bool:
    """cek satu titik (scalar lat/lon). True kalau jatuh di daratan Indonesia."""
    from shapely.geometry import Point
    return _load_geometry().contains(Point(float(lon), float(lat)))


def is_indonesia_vectorized(lat_array, lon_array) -> np.ndarray:
    """cek banyak titik sekaligus (array-like lat/lon, urutan harus sama
    panjang). Return boolean numpy array. Jauh lebih cepat dibanding loop
    is_indonesia() satu-satu untuk grid/dataframe besar."""
    import shapely

    geom = _load_geometry()
    lat_arr = np.asarray(lat_array, dtype="float64")
    lon_arr = np.asarray(lon_array, dtype="float64")
    # shapely >= 2.0
    if hasattr(shapely, "contains_xy"):
        return shapely.contains_xy(geom, lon_arr, lat_arr)
    # fallback untuk shapely < 2.0
    import shapely.vectorized as sv
    return sv.contains(geom, lon_arr, lat_arr)