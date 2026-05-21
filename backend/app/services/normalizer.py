from __future__ import annotations

from statistics import mean
from typing import Any

FLAG_MAP = {
    "arm_abd": "arm_abduction",
    "wr_dev": "wrist_deviation",
    "nk_tw": "neck_twist",
    "tr_tw": "trunk_twist",
}


def normalize_barobon_payload(payload: dict[str, Any], validation_warnings: list[str]) -> dict[str, Any]:
    time_series = payload["time_series_data"]
    summary = payload["summary"]
    metadata = payload.get("metadata") or {}
    frame_scores = [int(score) for score in time_series["rula"]]
    seconds = [float(sec) for sec in time_series["sec"]]
    frames = [_build_frame(index, time_series) for index in range(len(seconds))]

    score_adjustments = _extract_score_adjustments(summary.get("risk_details") or {}, metadata)
    limitations = _build_limitations(payload, validation_warnings)

    canonical = {
        "schema_version": "barobon-rula.v1",
        "source_format": "barobon_columnar",
        "metadata": {
            "angles_unit": "deg",
            "worker_load_kg": metadata.get("worker_load_kg"),
            "leg_condition_score": metadata.get("leg_condition_score"),
        },
        "task": {
            "task_name": payload.get("task_name"),
            "assessment_method": payload.get("assessment_method") or "RULA",
            "sampling_hz": payload.get("sampling_hz"),
            "duration_sec": max(seconds) if seconds else None,
            "pose_confidence": payload.get("pose_confidence"),
        },
        "session_scores": {
            "final_score": int(summary["score"]),
            "final_action": summary.get("action") or _action_from_score(int(summary["score"])),
            "frame_score_max": max(frame_scores),
            "frame_score_avg": round(mean(frame_scores), 2),
            "score_adjustments": score_adjustments,
        },
        "frames": frames,
        "peak_risk_event": _build_peak_event(payload.get("peak_risk_event"), frames),
        "windows": [],
        "limitations": limitations,
    }
    return canonical


def _build_frame(index: int, time_series: dict[str, Any]) -> dict[str, Any]:
    flags = _normalize_flags(_value_at(time_series, "flags", index, default={}) or {})
    angles = {
        "trunk_deg": _rounded_at(time_series, "trunk", index),
        "elbow_deg": _rounded_at(time_series, "elbow", index),
        "upper_arm_deg": _rounded_at(time_series, "upper_arm", index),
        "neck_deg": _rounded_at(time_series, "neck", index),
        "wrist_deg": _rounded_at(time_series, "wrist", index),
        "twist_score": _rounded_at(time_series, "twist", index),
    }
    clean_angles = {key: value for key, value in angles.items() if value is not None}
    return {
        "frame_id": f"F-{index + 1:06d}",
        "source_index": index,
        "time_sec": _rounded_at(time_series, "sec", index),
        "side": _normalize_side(_value_at(time_series, "side", index, default="unknown")),
        "frame_score": int(_value_at(time_series, "rula", index, default=0)),
        "angles": clean_angles,
        "flags": flags,
        "drivers": infer_frame_drivers(clean_angles, flags),
    }


def infer_frame_drivers(angles: dict[str, float], flags: dict[str, bool]) -> list[str]:
    drivers: list[str] = []
    thresholds = {
        "trunk_deg": (60, "trunk_flexion"),
        "neck_deg": (20, "neck_flexion"),
        "wrist_deg": (45, "wrist_angle"),
        "upper_arm_deg": (45, "upper_arm_elevation"),
    }
    for key, (threshold, label) in thresholds.items():
        value = angles.get(key)
        if value is not None and abs(value) >= threshold:
            drivers.append(label)
    for key, enabled in flags.items():
        if enabled:
            drivers.append(key)
    return sorted(set(drivers))


def _build_peak_event(raw_peak: dict[str, Any] | None, frames: list[dict[str, Any]]) -> dict[str, Any]:
    if raw_peak and "second" in raw_peak:
        second = float(raw_peak["second"])
        match = min(frames, key=lambda frame: abs(float(frame["time_sec"]) - second))
    else:
        match = max(frames, key=lambda frame: frame["frame_score"])

    return {
        "second": match["time_sec"],
        "score": match["frame_score"],
        "source_index": match["source_index"],
        "frame_id": match["frame_id"],
        "side": match["side"],
        "drivers": match["drivers"],
        "related_flags": [key for key, enabled in match["flags"].items() if enabled],
    }


def _extract_score_adjustments(risk_details: dict[str, Any], metadata: dict[str, Any]) -> dict[str, bool]:
    return {
        "trunk_twist": _detail_detected(risk_details.get("trunk_twist")),
        "wrist_twist": _detail_detected(risk_details.get("wrist_twist")),
        "repetition_or_static": _detail_detected(risk_details.get("repetition_or_static")),
        "heavy_load": _detail_detected(risk_details.get("heavy_load")) or float(metadata.get("worker_load_kg") or 0) > 10,
    }


def _build_limitations(payload: dict[str, Any], warnings: list[str]) -> list[str]:
    limitations = list(dict.fromkeys(warnings))
    if payload.get("task_name") is None:
        limitations.append("작업명이 입력되지 않아 작업명 기반 해석은 생략합니다.")
    if payload.get("pose_confidence") is None:
        limitations.append("pose confidence가 없어 자세 추정 신뢰도 평가는 생략합니다.")
    if payload.get("sampling_hz") is None:
        limitations.append("sampling_hz가 없어 실제 프레임 속도 기반 해석은 생략합니다.")
    return limitations


def _normalize_flags(flags: dict[str, Any]) -> dict[str, bool]:
    normalized = {target: False for target in FLAG_MAP.values()}
    for source, target in FLAG_MAP.items():
        normalized[target] = bool(flags.get(source, False))
    return normalized


def _normalize_side(value: Any) -> str:
    text = str(value or "").strip().lower()
    if text in {"left", "l", "왼쪽"}:
        return "left"
    if text in {"right", "r", "오른쪽"}:
        return "right"
    return "unknown"


def _detail_detected(value: Any) -> bool:
    text = str(value or "")
    return "발견" in text or "+1" in text or text.lower() in {"true", "yes", "detected"}


def _rounded_at(time_series: dict[str, Any], key: str, index: int) -> float | None:
    value = _value_at(time_series, key, index)
    if value is None:
        return None
    return round(float(value), 2)


def _value_at(time_series: dict[str, Any], key: str, index: int, default: Any = None) -> Any:
    values = time_series.get(key)
    if not isinstance(values, list) or index >= len(values):
        return default
    return values[index]


def _action_from_score(score: int) -> str:
    if score >= 7:
        return "즉각적인 개선 필요"
    if score >= 5:
        return "빠른 개선 검토 필요"
    if score >= 3:
        return "추가 관찰 필요"
    return "허용 가능"

