from __future__ import annotations

import base64
import os
import tempfile
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from app.config import settings
from app.services.errors import PipelineInputError
from app.video_analyzer.analyzer_sec import analyze_video_per_second


def analyze_video_upload(filename: str, content: bytes, load_kg: float, leg_score: int) -> dict[str, Any]:
    if not content:
        raise PipelineInputError("빈 영상 파일은 분석할 수 없습니다.")

    if len(content) > settings.max_video_upload_bytes:
        max_mb = settings.max_video_upload_bytes // (1024 * 1024)
        raise PipelineInputError("업로드 영상이 너무 큽니다.", [f"최대 크기는 {max_mb}MB입니다."])

    suffix = Path(filename or "upload.mp4").suffix.lower()
    if suffix not in settings.allowed_video_extensions:
        allowed = ", ".join(settings.allowed_video_extensions)
        raise PipelineInputError("지원하지 않는 영상 형식입니다.", [f"허용 확장자: {allowed}"])

    temp_path = _write_temp_video(content, suffix)
    try:
        raw = analyze_video_per_second(
            temp_path,
            load_kg=load_kg,
            leg_score=leg_score,
            image_score_threshold=settings.high_risk_threshold,
        )
    finally:
        _safe_remove(temp_path)

    payload = build_barobon_payload(raw, filename, load_kg, leg_score)
    media = {
        "peak_image_data_url": image_to_data_url(raw.get("worst", {}).get("img")),
        "frame_image_data_urls": build_frame_image_media(raw),
        "image_source": "video_analyzer_sample_frames",
    }
    video_summary = build_video_summary(filename, payload, media)

    return {
        "status": "ok",
        "video_summary": video_summary,
        "payload": payload,
        "media": media,
    }


def build_barobon_payload(raw: dict[str, Any], filename: str, load_kg: float, leg_score: int) -> dict[str, Any]:
    summary = _json_clean(raw.get("summary") or {})
    time_series = _json_clean(raw.get("ts") or {})
    peak = _json_clean(raw.get("worst") or {})
    peak.pop("img", None)

    seconds = time_series.get("sec") if isinstance(time_series, dict) else []
    sampling_hz = _estimate_sampling_hz(seconds)

    return {
        "metadata": {
            "worker_load_kg": float(load_kg),
            "leg_condition_score": int(leg_score),
            "source_video_name": filename,
        },
        "task_name": filename,
        "assessment_method": "RULA",
        "sampling_hz": sampling_hz,
        "summary": summary,
        "time_series_data": time_series,
        "peak_risk_event": {
            "second": peak.get("sec"),
            "score": peak.get("score"),
        },
    }


def build_video_summary(filename: str, payload: dict[str, Any], media: dict[str, Any]) -> dict[str, Any]:
    summary = payload.get("summary") or {}
    time_series = payload.get("time_series_data") or {}
    peak = payload.get("peak_risk_event") or {}
    rula = time_series.get("rula") or []
    return {
        "filename": filename,
        "total_samples": len(time_series.get("sec") or []),
        "final_score": summary.get("score"),
        "frame_score_max": max(rula) if rula else None,
        "peak_second": peak.get("second"),
        "peak_score": peak.get("score"),
        "has_peak_image": bool(media.get("peak_image_data_url")),
        "has_frame_images": bool(media.get("frame_image_data_urls")),
        "frame_image_count": len(media.get("frame_image_data_urls") or {}),
    }


def build_frame_image_media(raw: dict[str, Any]) -> dict[str, str]:
    images: dict[str, str] = {}
    for item in raw.get("frame_images") or []:
        if not isinstance(item, dict):
            continue
        try:
            sample_index = int(item["sample_index"])
        except (KeyError, TypeError, ValueError):
            continue
        data_url = image_to_data_url(item.get("img"))
        if data_url:
            images[f"F-{sample_index + 1:06d}"] = data_url
    return images


def image_to_data_url(rgb_image: Any) -> str | None:
    if rgb_image is None:
        return None

    image = np.asarray(rgb_image)
    if image.size == 0:
        return None

    if image.ndim == 3 and image.shape[2] == 3:
        encoded_image = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
    else:
        encoded_image = image

    ok, buffer = cv2.imencode(".png", encoded_image)
    if not ok:
        return None

    encoded = base64.b64encode(buffer).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _write_temp_video(content: bytes, suffix: str) -> str:
    handle = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        handle.write(content)
        return handle.name
    finally:
        handle.close()


def _safe_remove(path: str) -> None:
    try:
        os.remove(path)
    except OSError:
        pass


def _estimate_sampling_hz(seconds: Any) -> float | None:
    if not isinstance(seconds, list) or len(seconds) < 2:
        return None

    deltas = []
    for current, previous in zip(seconds[1:], seconds[:-1]):
        try:
            delta = float(current) - float(previous)
        except (TypeError, ValueError):
            continue
        if delta > 0:
            deltas.append(delta)

    if not deltas:
        return None

    median_delta = float(np.median(deltas))
    if median_delta <= 0:
        return None
    return round(1.0 / median_delta, 3)


def _json_clean(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _json_clean(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_clean(item) for item in value]
    if isinstance(value, np.ndarray):
        return _json_clean(value.tolist())
    if isinstance(value, np.bool_):
        return bool(value)
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, np.floating):
        return float(value)
    return value
