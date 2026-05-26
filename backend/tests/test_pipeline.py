from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest

from app.services.errors import PipelineInputError
from app.services.evidence_builder import build_evidence_bundle
from app.services.parser import parse_json_upload
from app.services.pipeline import run_analysis
from app.services.validator import validate_barobon_payload
from app.services.verifier import verify_llm_result
from app.services.llm_client import _localize_analysis_result, _normalize_summary_fields

SAMPLE_PATH = Path(__file__).resolve().parents[1] / "app" / "samples" / "barobon_analysis_result_2.json"


def _sample_payload() -> dict:
    return json.loads(SAMPLE_PATH.read_text(encoding="utf-8"))


def test_sample_converts_to_52_canonical_frames() -> None:
    result = run_analysis("sample.json", SAMPLE_PATH.read_bytes())
    canonical = result["canonical"]
    first_summary = result["llm_result"]["first_analysis_summary"]

    assert result["input_summary"]["total_frames"] == 52
    assert canonical["session_scores"]["final_score"] == 7
    assert canonical["session_scores"]["frame_score_max"] == 6
    assert canonical["frames"][0]["side"] == "left"
    assert canonical["frames"][0]["flags"]["trunk_twist"] is True
    assert canonical["windows"]
    assert result["llm_meta"]["requested_provider"] == "openai"
    assert "computed_summary" in result["evidence_bundle"]
    assert result["llm_result"]["risk_summary"]
    assert result["llm_result"]["risk_highlights"]
    assert first_summary["headline"]
    assert first_summary["main_risk_cause"]
    assert 1 <= len(first_summary["top_3_actions"]) <= 3
    assert "분석을 통해" not in result["llm_result"]["risk_summary"]


def test_gemma_provider_is_accepted_and_recorded(monkeypatch: pytest.MonkeyPatch) -> None:
    def fail_fast(*args, **kwargs):
        raise RuntimeError("ollama unavailable in test")

    monkeypatch.setattr("app.services.llm_client.httpx.post", fail_fast)
    result = run_analysis("sample.json", SAMPLE_PATH.read_bytes(), provider="ollama")

    assert result["input_summary"]["requested_provider"] == "ollama"
    assert result["llm_meta"]["requested_provider"] == "ollama"
    assert result["llm_meta"]["model"] == "qwen3.5:9b"
    assert result["llm_result"]["overall_assessment"]["final_score"] == 7


def test_mismatched_time_series_lengths_are_rejected() -> None:
    payload = _sample_payload()
    payload["time_series_data"]["wrist"] = payload["time_series_data"]["wrist"][:-1]

    with pytest.raises(PipelineInputError) as exc:
        validate_barobon_payload(payload)

    assert "wrist" in str(exc.value.details)


def test_parser_rejects_non_json_extension() -> None:
    with pytest.raises(PipelineInputError):
        parse_json_upload("sample.txt", b"{}")


def test_verifier_flags_invalid_evidence_ids() -> None:
    result = run_analysis("sample.json", SAMPLE_PATH.read_bytes())
    llm_result = copy.deepcopy(result["llm_result"])
    llm_result["overall_assessment"]["evidence_ids"].append("W-999")

    verification = verify_llm_result(llm_result, result["evidence_bundle"])

    assert verification["passed"] is False
    assert "W-999" in verification["invalid_evidence_ids"]


def test_procedure_summary_is_replaced_with_computed_risk_summary() -> None:
    result = run_analysis("sample.json", SAMPLE_PATH.read_bytes())
    bad_llm_result = {
        "analysis_status": "llm",
        "first_analysis_summary": {
            "headline": "RULA 작업 자세 분석을 통해 작업 자세 평가를 수행했습니다.",
            "risk_level_summary": "",
            "main_risk_cause": "",
            "priority_action": "평가를 수행했습니다.",
            "focus_time_range": "",
            "top_3_actions": [],
        },
        "task_summary": "RULA 작업 자세 분석을 통해 52초 동안의 작업을 평가를 수행했습니다.",
        "overall_assessment": result["llm_result"]["overall_assessment"],
        "key_findings": result["llm_result"]["key_findings"],
        "recommendations": result["llm_result"]["recommendations"],
        "limitations": [],
    }

    normalized = _normalize_summary_fields(bad_llm_result, result["evidence_bundle"])

    assert "분석을 통해" not in normalized["risk_summary"]
    assert normalized["risk_summary"].startswith("최종 보정 점수는 7점")
    assert normalized["risk_highlights"][0].startswith("최종 보정 점수 7점")
    assert "분석을 통해" not in normalized["first_analysis_summary"]["headline"]
    assert normalized["first_analysis_summary"]["top_3_actions"]


def test_first_analysis_summary_fallback_contract_is_complete() -> None:
    result = run_analysis("sample.json", SAMPLE_PATH.read_bytes())
    first_summary = result["evidence_bundle"]["computed_summary"]["first_summary_fallback"]

    assert set(first_summary) == {
        "headline",
        "risk_level_summary",
        "main_risk_cause",
        "priority_action",
        "focus_time_range",
        "top_3_actions",
    }
    assert first_summary["priority_action"]
    assert len(first_summary["top_3_actions"]) <= 3
    assert len(result["evidence_bundle"]["computed_summary"]["priority_focus_windows"]) <= 3


def test_evidence_text_uses_korean_labels_for_risk_codes() -> None:
    result = run_analysis("sample.json", SAMPLE_PATH.read_bytes())
    evidence_text = build_evidence_bundle(result["canonical"])["evidence_text"]
    forbidden = ("trunk_twist", "wrist_angle", "wrist_deviation", "upper_arm_elevation", "neck_twist")

    assert all(token not in evidence_text for token in forbidden)
    assert "몸통 비틀림" in evidence_text


def test_llm_result_risk_codes_are_localized() -> None:
    result = {
        "analysis_status": "llm",
        "first_analysis_summary": {
            "headline": "trunk_flexion과 wrist_angle이 반복됩니다.",
            "risk_level_summary": "trunk, wrist 부담이 큽니다.",
            "main_risk_cause": "trunk_twist",
            "priority_action": "wrist_deviation을 줄이세요.",
            "focus_time_range": "left 구간",
            "top_3_actions": ["upper_arm_elevation 완화"],
        },
        "risk_summary": "neck_flexion 및 wrist_angle 확인",
        "risk_highlights": ["주요 부위: trunk, wrist"],
        "task_summary": "trunk_flexion 확인",
        "overall_assessment": {"final_score": 7, "frame_score_max": 6, "severity_label": "즉각적인 개선 필요", "evidence_ids": []},
        "key_findings": [
            {
                "claim": "trunk_twist와 wrist_angle이 동시에 나타납니다.",
                "risk_factors": ["trunk_twist", "wrist_angle"],
                "evidence_ids": ["W-001"],
                "confidence": "medium",
            }
        ],
        "recommendations": [
            {
                "proposal": "wrist_deviation을 줄입니다.",
                "target_risk_factors": ["wrist_deviation", "upper_arm_elevation"],
                "evidence_ids": ["W-001"],
            }
        ],
        "limitations": ["side가 left로만 확인됨"],
    }

    localized = _localize_analysis_result(result)
    rendered = json.dumps(localized, ensure_ascii=False)

    assert "trunk_twist" not in rendered
    assert "wrist_angle" not in rendered
    assert "upper_arm_elevation" not in rendered
    assert "몸통 비틀림" in rendered
    assert "손목 부담" in rendered
    assert "상완 거상" in rendered
