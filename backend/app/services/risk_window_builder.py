from __future__ import annotations

from collections import Counter
from statistics import mean

from app.config import settings

BODY_PART_BY_DRIVER = {
    "trunk_flexion": "trunk",
    "trunk_twist": "trunk",
    "neck_flexion": "neck",
    "neck_twist": "neck",
    "wrist_angle": "wrist",
    "wrist_deviation": "wrist",
    "upper_arm_elevation": "upper_arm",
    "arm_abduction": "upper_arm",
}


def attach_risk_windows(canonical: dict, threshold: int | None = None) -> dict:
    threshold = threshold or settings.high_risk_threshold
    frames = canonical["frames"]
    windows = []
    current: list[dict] = []

    for frame in frames:
        if frame["frame_score"] >= threshold:
            current.append(frame)
            continue
        if current:
            windows.append(_make_window(len(windows) + 1, current))
            current = []

    if current:
        windows.append(_make_window(len(windows) + 1, current))

    canonical["windows"] = windows
    return canonical


def _make_window(number: int, frames: list[dict]) -> dict:
    drivers = sorted({driver for frame in frames for driver in frame["drivers"]})
    body_parts = _dominant_body_parts(drivers)
    scores = [frame["frame_score"] for frame in frames]
    representative_frames = _representative_frame_ids(frames)
    return {
        "window_id": f"W-{number:03d}",
        "start_sec": frames[0]["time_sec"],
        "end_sec": frames[-1]["time_sec"],
        "duration_sec": round(float(frames[-1]["time_sec"]) - float(frames[0]["time_sec"]) + 1, 2),
        "window_score_max": max(scores),
        "window_score_avg": round(mean(scores), 2),
        "dominant_body_parts": body_parts,
        "drivers": drivers,
        "frame_ids": [frame["frame_id"] for frame in frames],
        "representative_frame_ids": representative_frames,
    }


def _dominant_body_parts(drivers: list[str]) -> list[str]:
    counter = Counter(BODY_PART_BY_DRIVER.get(driver, driver) for driver in drivers)
    return [part for part, _ in counter.most_common()]


def _representative_frame_ids(frames: list[dict]) -> list[str]:
    first = frames[0]
    peak = max(frames, key=lambda frame: frame["frame_score"])
    last = frames[-1]
    ids = [first["frame_id"], peak["frame_id"], last["frame_id"]]
    return list(dict.fromkeys(ids))

