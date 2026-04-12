from __future__ import annotations

from pathlib import Path
from typing import Optional


def repo_root() -> Path:
    # Anchor on this file location: repo/src/utils/paths.py → repo
    return Path(__file__).resolve().parents[2]


def get_data_root() -> Path:
    return repo_root() / "data"


def get_api_data_root() -> Path:
    return repo_root() / "apps" / "api" / "data"


def get_db_by_letter_dir() -> Optional[Path]:
    # Prefer API dump if present
    api = get_api_data_root() / "db_by_letter"
    if api.exists():
        return api
    # Fallback to repo data/db_by_letter if used
    rep = get_data_root() / "db_by_letter"
    if rep.exists():
        return rep
    return None


def get_hhd_by_letter_dir() -> Optional[Path]:
    p = get_data_root() / "hhd_by_letter"
    return p if p.exists() else None


def get_strokes_root() -> Path:
    return get_data_root() / "strokes"


def ensure_strokes_splits() -> None:
    base = get_strokes_root()
    for split in ("train", "val", "test"):
        (base / split).mkdir(parents=True, exist_ok=True)

