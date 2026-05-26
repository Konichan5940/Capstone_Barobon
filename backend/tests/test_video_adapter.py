from __future__ import annotations

import numpy as np

from app.services.pipeline import run_analysis_payload
from app.services.video_adapter import build_barobon_payload, build_frame_image_media, build_video_summary, image_to_data_url


def _fake_raw_result() -> dict:
    return {
        "summary": {
            "score": np.int64(7),
            "action": "즉각적인 개선 필요",
            "total": np.int64(3),
            "risk_details": {
                "trunk_twist": "정상",
                "wrist_twist": "발견 (+1 감점)",
                "repetition_or_static": "정상",
                "heavy_load": "해당 (+1 감점)",
            },
        },
        "ts": {
            "sec": [0.5, 1.0, 1.5],
            "trunk": [10.0, 15.0, 20.0],
            "elbow": [90.0, 95.0, 100.0],
            "upper_arm": [20.0, 30.0, 40.0],
            "neck": [5.0, 8.0, 12.0],
            "wrist": [10.0, 15.0, 20.0],
            "twist": [1, 2, 2],
            "rula": [5, 6, 7],
            "flags": [
                {"arm_abd": False, "wr_dev": False, "nk_tw": False, "tr_tw": False},
                {"arm_abd": False, "wr_dev": True, "nk_tw": False, "tr_tw": False},
                {"arm_abd": True, "wr_dev": True, "nk_tw": False, "tr_tw": False},
            ],
            "side": ["Left", "Left", "Right"],
        },
        "worst": {
            "img": np.zeros((4, 4, 3), dtype=np.uint8),
            "sec": np.float64(1.5),
            "score": np.int64(7),
        },
        "frame_images": [
            {"sample_index": 0, "sec": 0.5, "score": 5, "img": np.zeros((4, 4, 3), dtype=np.uint8)},
            {"sample_index": 2, "sec": 1.5, "score": 7, "img": np.zeros((4, 4, 3), dtype=np.uint8)},
        ],
    }


def test_video_result_converts_to_barobon_payload() -> None:
    payload = build_barobon_payload(_fake_raw_result(), "sample.mp4", load_kg=5.0, leg_score=1)

    assert payload["metadata"]["source_video_name"] == "sample.mp4"
    assert payload["summary"]["score"] == 7
    assert payload["summary"]["total"] == 3
    assert payload["time_series_data"]["sec"] == [0.5, 1.0, 1.5]
    assert payload["time_series_data"]["rula"] == [5, 6, 7]
    assert payload["peak_risk_event"] == {"second": 1.5, "score": 7}


def test_peak_image_converts_to_data_url() -> None:
    image = np.zeros((3, 3, 3), dtype=np.uint8)
    data_url = image_to_data_url(image)

    assert data_url is not None
    assert data_url.startswith("data:image/png;base64,")


def test_frame_images_convert_to_frame_id_map() -> None:
    image_map = build_frame_image_media(_fake_raw_result())

    assert set(image_map) == {"F-000001", "F-000003"}
    assert image_map["F-000003"].startswith("data:image/png;base64,")


def test_video_summary_and_payload_analysis_contract(monkeypatch) -> None:
    def fake_llm_report(evidence_bundle, provider="openai"):
        return (
            {
                "analysis_status": "fallback",
                "overall_assessment": {"final_score": 7, "severity_label": "즉각적인 개선 필요", "evidence_ids": []},
                "key_findings": [],
                "recommendations": [],
                "limitations": [],
            },
            {"requested_provider": provider, "model": "test", "mode": "fallback"},
        )

    monkeypatch.setattr("app.services.pipeline.generate_llm_report", fake_llm_report)
    raw = _fake_raw_result()
    payload = build_barobon_payload(raw, "sample.mp4", load_kg=5.0, leg_score=1)
    media = {
        "peak_image_data_url": image_to_data_url(raw["worst"]["img"]),
        "frame_image_data_urls": build_frame_image_media(raw),
        "image_source": "video_analyzer_sample_frames",
    }
    summary = build_video_summary("sample.mp4", payload, media)
    result = run_analysis_payload(payload, filename="sample.mp4", provider="openai", media=media)

    assert summary["total_samples"] == 3
    assert summary["has_peak_image"] is True
    assert summary["has_frame_images"] is True
    assert summary["frame_image_count"] == 2
    assert result["status"] == "ok"
    assert result["input_summary"]["filename"] == "sample.mp4"
    assert result["media"]["peak_image_data_url"].startswith("data:image/png;base64,")
    assert result["media"]["frame_image_data_urls"]["F-000003"].startswith("data:image/png;base64,")
