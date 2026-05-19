from __future__ import annotations

import json
import re
from typing import Any

import httpx

from app.config import settings
from app.services.errors import PipelineInputError

ANALYSIS_RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": [
        "analysis_status",
        "first_analysis_summary",
        "risk_summary",
        "risk_highlights",
        "task_summary",
        "overall_assessment",
        "key_findings",
        "recommendations",
        "limitations",
    ],
    "properties": {
        "analysis_status": {"type": "string", "enum": ["llm"]},
        "first_analysis_summary": {
            "type": "object",
            "additionalProperties": False,
            "required": [
                "headline",
                "risk_level_summary",
                "main_risk_cause",
                "priority_action",
                "focus_time_range",
                "top_3_actions",
            ],
            "properties": {
                "headline": {"type": "string"},
                "risk_level_summary": {"type": "string"},
                "main_risk_cause": {"type": "string"},
                "priority_action": {"type": "string"},
                "focus_time_range": {"type": "string"},
                "top_3_actions": {
                    "type": "array",
                    "items": {"type": "string"},
                    "minItems": 1,
                    "maxItems": 3,
                },
            },
        },
        "risk_summary": {"type": "string"},
        "risk_highlights": {
            "type": "array",
            "items": {"type": "string"},
            "minItems": 1,
            "maxItems": 5,
        },
        "task_summary": {"type": "string"},
        "overall_assessment": {
            "type": "object",
            "additionalProperties": False,
            "required": ["final_score", "frame_score_max", "severity_label", "evidence_ids"],
            "properties": {
                "final_score": {"type": "integer"},
                "frame_score_max": {"type": "integer"},
                "severity_label": {"type": "string"},
                "evidence_ids": {"type": "array", "items": {"type": "string"}},
            },
        },
        "key_findings": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["claim", "risk_factors", "evidence_ids", "confidence"],
                "properties": {
                    "claim": {"type": "string"},
                    "risk_factors": {"type": "array", "items": {"type": "string"}},
                    "evidence_ids": {"type": "array", "items": {"type": "string"}},
                    "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
                },
            },
        },
        "recommendations": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["proposal", "target_risk_factors", "evidence_ids"],
                "properties": {
                    "proposal": {"type": "string"},
                    "target_risk_factors": {"type": "array", "items": {"type": "string"}},
                    "evidence_ids": {"type": "array", "items": {"type": "string"}},
                },
            },
        },
        "limitations": {"type": "array", "items": {"type": "string"}},
    },
}


SYSTEM_PROMPT = """당신은 RULA 기반 작업 자세 분석 결과를 설명하는 인간공학 해석 도우미다.
입력된 evidence bundle 안의 정보만 근거로 사용한다.
입력에 없는 숫자, 시간, 관절 각도, 부위, 좌우 정보를 만들지 마라.
RULA 결과를 의학적 진단처럼 표현하지 마라.
모든 핵심 주장에는 evidence_ids를 연결하라.
final_score와 frame_score_max를 혼동하지 마라.
task_summary 또는 risk_summary에는 분석 절차나 시스템 동작을 설명하지 마라.
예: "RULA 작업 자세 분석을 통해", "평가를 수행했습니다" 같은 문장은 금지한다.
요약문에는 최종 점수/위험 수준, 고위험 구간 수, 주요 위험 부위, 주요 자세 요인, 집중 시간대 중 3개 이상을 포함하라.
computed_summary의 값을 우선 사용해 사용자가 바로 행동 판단을 할 수 있는 핵심 위험 요약을 작성하라.
first_analysis_summary는 결과 화면 최상단 카드에 표시된다.
first_analysis_summary.headline은 점수보다 현재 작업의 핵심 위험 구조를 먼저 말하라.
first_analysis_summary.main_risk_cause는 가장 중요한 원인 1개를 중심으로 설명하라.
first_analysis_summary.priority_action과 top_3_actions에는 사용자가 바로 실행할 수 있는 작업 환경 개선 행동을 작성하라.
first_analysis_summary.focus_time_range에는 대표 위험 구간만 최대 3개까지 설명하라.
위험 부위와 자세 요인을 단순 나열하지 말고 원인과 행동을 연결하라.
불확실하거나 누락된 정보는 limitations에 명시하라.
반드시 JSON Schema에 맞는 JSON만 출력하라."""

OLLAMA_SYSTEM_PROMPT = """당신은 RULA 작업 자세 결과를 한국어로 요약하는 인간공학 해석 도우미다.
입력 근거에 없는 숫자, 시간, 부위, 좌우 정보를 만들지 마라.
절차 설명을 쓰지 말고 사용자가 바로 이해할 위험 요약과 개선 방향만 작성하라.
반드시 JSON 객체만 출력하라."""

PROCEDURE_SUMMARY_PHRASES = (
    "분석을 통해",
    "평가를 수행했습니다",
    "식별하고",
    "기반으로 인간공학적 평가",
    "작업 자세 분석을 통해",
    "RULA 작업 자세 분석",
)


def generate_llm_report(evidence_bundle: dict, provider: str = "openai") -> tuple[dict, dict]:
    provider = _normalize_provider(provider)
    if provider == "ollama":
        return _generate_ollama_report(evidence_bundle)
    return _generate_openai_report(evidence_bundle)


def _normalize_provider(provider: str) -> str:
    normalized = (provider or "openai").strip().lower()
    aliases = {
        "gpt": "openai",
        "openai": "openai",
        "chatgpt": "openai",
        "ollama": "ollama",
        "qwen": "ollama",
        "qwen3.5": "ollama",
        "qwen3.5:9b": "ollama",
    }
    if normalized not in aliases:
        raise PipelineInputError(
            "지원하지 않는 LLM provider입니다.",
            ["provider는 openai 또는 ollama 중 하나여야 합니다."],
        )
    return aliases[normalized]


def _generate_openai_report(evidence_bundle: dict) -> tuple[dict, dict]:
    if not settings.openai_api_key:
        return _fallback_report(
            evidence_bundle,
            "OPENAI_API_KEY가 설정되지 않아 규칙 기반 fallback 결과를 생성했습니다.",
            requested_provider="openai",
        )

    try:
        from openai import OpenAI

        client = OpenAI(api_key=settings.openai_api_key)
        response = client.responses.create(
            model=settings.openai_model,
            input=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": (
                        "다음 evidence bundle을 근거로 인간공학 리포트를 JSON으로 작성해줘.\n\n"
                        f"{evidence_bundle['evidence_text']}"
                    ),
                },
            ],
            text={
                "format": {
                    "type": "json_schema",
                    "name": "rula_report",
                    "strict": True,
                    "schema": ANALYSIS_RESPONSE_SCHEMA,
                }
            },
            temperature=settings.openai_temperature,
            max_output_tokens=settings.openai_max_output_tokens,
            store=False,
        )
        result = json.loads(response.output_text)
        result = _complete_analysis_result(result, evidence_bundle)
        _ensure_analysis_result(result)
        result = _normalize_summary_fields(result, evidence_bundle)
        return result, {
            "mode": "openai",
            "requested_provider": "openai",
            "model": settings.openai_model,
            "error": None,
        }
    except Exception as exc:  # noqa: BLE001 - the API surface may fail for env/network/schema reasons.
        return _fallback_report(evidence_bundle, f"OpenAI LLM 호출 실패: {exc}", requested_provider="openai")


def _generate_ollama_report(evidence_bundle: dict) -> tuple[dict, dict]:
    evidence_text = _render_ollama_evidence_text(evidence_bundle)
    try:
        response = httpx.post(
            f"{settings.ollama_base_url.rstrip('/')}/api/chat",
            json={
                "model": settings.ollama_model,
                "stream": False,
                "think": False,
                "format": "json",
                "messages": [
                    {"role": "system", "content": OLLAMA_SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": (
                            "다음 evidence bundle을 근거로 핵심 위험 요약만 작성하라.\n"
                            "반드시 아래 4개 최상위 필드만 가진 JSON 객체를 출력하라: "
                            "first_analysis_summary, risk_summary, risk_highlights, limitations.\n"
                            "first_analysis_summary는 headline, risk_level_summary, main_risk_cause, "
                            "priority_action, focus_time_range, top_3_actions를 포함하라.\n"
                            "모든 문장은 한국어로 짧게 작성하라.\n\n"
                            f"[Evidence Bundle]\n{evidence_text}"
                        ),
                    },
                ],
                "options": {
                    "temperature": 0,
                    "top_p": 0.95,
                    "top_k": 64,
                    "num_predict": min(settings.ollama_num_predict, 1024),
                },
            },
            timeout=settings.ollama_timeout_sec,
        )
        response.raise_for_status()
        payload = response.json()
        content = (payload.get("message") or {}).get("content", "")
        result = _loads_json_object(content)
        result = _complete_analysis_result(result, evidence_bundle)
        _ensure_analysis_result(result)
        result = _normalize_summary_fields(result, evidence_bundle)
        result["analysis_status"] = "llm"
        return result, {
            "mode": "ollama",
            "requested_provider": "ollama",
            "model": settings.ollama_model,
            "error": None,
        }
    except Exception as exc:  # noqa: BLE001 - Ollama may be unavailable or return non-JSON text.
        return _fallback_report(evidence_bundle, f"Ollama LLM 호출 실패: {exc}", requested_provider="ollama")


def _render_ollama_evidence_text(evidence_bundle: dict) -> str:
    computed = evidence_bundle["computed_summary"]
    session = evidence_bundle["session_summary"]
    windows = {window["window_id"]: window for window in evidence_bundle["high_risk_windows"]}
    focus_ids = [window["window_id"] for window in computed.get("priority_focus_windows", [])]
    selected_ids = list(dict.fromkeys([*focus_ids, *list(windows)[:2]]))[:5]

    lines = [
        "<computed_summary>",
        f"- final_score: {computed['final_score']}",
        f"- final_action: {computed['final_action']}",
        f"- frame_score_max: {computed['frame_score_max']}",
        f"- frame_score_avg: {computed['frame_score_avg']}",
        f"- high_risk_window_count: {computed['high_risk_window_count']}",
        f"- main_body_parts: {computed['main_body_parts']}",
        f"- main_drivers: {computed['main_drivers']}",
        f"- high_risk_times: {computed.get('high_risk_times', [])[:5]}",
        f"- priority_focus_windows: {computed.get('priority_focus_windows', [])}",
        f"- recommended_actions: {computed.get('recommended_action_seed', [])}",
        "</computed_summary>",
        "<session_summary>",
        f"- assessment_method: {session['assessment_method']}",
        f"- duration_sec: {session['duration_sec']}",
        f"- score_adjustments: {session['score_adjustments']}",
        "</session_summary>",
        "<selected_evidence_windows>",
    ]

    for window_id in selected_ids:
        window = windows.get(window_id)
        if not window:
            continue
        lines.extend(
            [
                f'<window id="{window["window_id"]}" time="{window["start_sec"]}~{window["end_sec"]}">',
                f"- max_score: {window['window_score_max']}",
                f"- body_parts: {window['dominant_body_parts']}",
                f"- drivers: {window['drivers']}",
                "</window>",
            ]
        )

    peak = evidence_bundle["peak_risk_event"]
    lines.extend(
        [
            "</selected_evidence_windows>",
            "<peak_risk_event>",
            f"- frame_id: {peak.get('frame_id')}",
            f"- second: {peak.get('second')}",
            f"- score: {peak.get('score')}",
            f"- side: {peak.get('side')}",
            f"- drivers: {peak.get('drivers')}",
            f"- related_flags: {peak.get('related_flags')}",
            "</peak_risk_event>",
            f"<selected_evidence_ids>{selected_ids + [peak.get('frame_id')]}</selected_evidence_ids>",
            "<limitations>",
        ]
    )
    lines.extend(f"- {limitation}" for limitation in evidence_bundle["limitations"])
    lines.append("</limitations>")
    return "\n".join(lines)


def _loads_json_object(text: str) -> dict[str, Any]:
    cleaned = re.sub(r"<think>.*?</think>", "", text or "", flags=re.DOTALL | re.IGNORECASE).strip()
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", cleaned, flags=re.DOTALL)
        if not match:
            raise
        parsed = json.loads(match.group(0))
    if not isinstance(parsed, dict):
        raise ValueError("LLM 응답이 JSON object가 아닙니다.")
    return parsed


def _ensure_analysis_result(result: dict[str, Any]) -> None:
    required = ("task_summary", "overall_assessment", "key_findings", "recommendations", "limitations")
    missing = [key for key in required if key not in result]
    if missing:
        raise ValueError(f"LLM 응답에 필수 필드가 없습니다: {', '.join(missing)}")


def _complete_analysis_result(result: dict[str, Any], evidence_bundle: dict) -> dict[str, Any]:
    fallback, _ = _fallback_report(
        evidence_bundle,
        "LLM 응답에서 누락된 필드를 계산된 기본값으로 보정했습니다.",
        requested_provider="ollama",
    )
    corrected: list[str] = []

    if result.get("analysis_status") != "llm":
        result["analysis_status"] = "llm"

    for key in ("first_analysis_summary", "risk_summary", "risk_highlights", "task_summary"):
        if key not in result:
            result[key] = fallback[key]
            corrected.append(key)

    assessment = result.get("overall_assessment")
    required_assessment = {"final_score", "frame_score_max", "severity_label", "evidence_ids"}
    if not isinstance(assessment, dict) or not required_assessment.issubset(assessment):
        result["overall_assessment"] = fallback["overall_assessment"]
        corrected.append("overall_assessment")

    for key in ("key_findings", "recommendations", "limitations"):
        if not isinstance(result.get(key), list):
            result[key] = fallback[key]
            corrected.append(key)

    if corrected:
        result["limitations"] = [
            *result.get("limitations", []),
            f"LLM 응답에서 누락된 필드를 계산된 기본값으로 보정했습니다: {', '.join(dict.fromkeys(corrected))}",
        ]

    return result


def _normalize_summary_fields(result: dict[str, Any], evidence_bundle: dict) -> dict[str, Any]:
    computed = evidence_bundle["computed_summary"]
    fallback_summary = computed["fallback_risk_summary"]
    current_summary = str(result.get("risk_summary") or result.get("task_summary") or "").strip()

    if not current_summary or _is_procedure_summary(current_summary):
        current_summary = fallback_summary
        warnings = result.setdefault("limitations", [])
        if isinstance(warnings, list):
            warnings.append("LLM 요약이 절차 설명에 가까워 계산된 핵심 위험 요약으로 대체했습니다.")

    result["risk_summary"] = current_summary
    result["task_summary"] = current_summary

    highlights = result.get("risk_highlights")
    if not isinstance(highlights, list) or not highlights:
        result["risk_highlights"] = computed["risk_highlights"]
    else:
        result["risk_highlights"] = [str(item) for item in highlights[:5]]

    result["first_analysis_summary"] = _normalize_first_analysis_summary(
        result.get("first_analysis_summary"),
        computed,
    )

    return result


def _is_procedure_summary(text: str) -> bool:
    return any(phrase in text for phrase in PROCEDURE_SUMMARY_PHRASES)


def _fallback_report(evidence_bundle: dict, reason: str, requested_provider: str = "openai") -> tuple[dict, dict]:
    summary = evidence_bundle["session_summary"]
    computed = evidence_bundle["computed_summary"]
    windows = evidence_bundle["high_risk_windows"]
    first_window = windows[0] if windows else None
    evidence_ids = [first_window["window_id"]] if first_window else []
    peak_frame_id = evidence_bundle["peak_risk_event"]["frame_id"]
    if peak_frame_id:
        evidence_ids.append(peak_frame_id)
    evidence_ids = list(dict.fromkeys(evidence_ids))

    risk_factors = first_window["drivers"] if first_window else evidence_bundle["peak_risk_event"]["drivers"]
    body_parts = first_window["dominant_body_parts"] if first_window else []
    where = (
        f"{first_window['start_sec']}초부터 {first_window['end_sec']}초까지"
        if first_window
        else f"{evidence_bundle['peak_risk_event']['second']}초"
    )

    result = {
        "analysis_status": "fallback",
        "first_analysis_summary": computed["first_summary_fallback"],
        "risk_summary": computed["fallback_risk_summary"],
        "risk_highlights": computed["risk_highlights"],
        "task_summary": computed["fallback_risk_summary"],
        "overall_assessment": {
            "final_score": int(summary["final_score"]),
            "frame_score_max": int(summary["frame_score_max"]),
            "severity_label": summary["final_action"],
            "evidence_ids": evidence_ids,
        },
        "key_findings": [
            {
                "claim": f"{where} 고위험 자세가 관찰되었고 주요 부위는 {', '.join(body_parts) or 'unknown'}입니다.",
                "risk_factors": risk_factors,
                "evidence_ids": evidence_ids,
                "confidence": "medium",
            }
        ],
        "recommendations": [
            {
                "proposal": "작업 대상의 위치와 높이를 조정해 몸통 굴곡과 손목 부담을 줄이는 방향으로 개선을 검토합니다.",
                "target_risk_factors": risk_factors[:3],
                "evidence_ids": evidence_ids,
            }
        ],
        "limitations": list(dict.fromkeys([reason, *evidence_bundle["limitations"], "본 결과는 자세 부담 해석이며 의학적 진단이 아닙니다."])),
    }
    return result, {
        "mode": "fallback",
        "requested_provider": requested_provider,
        "model": settings.ollama_model if requested_provider == "ollama" else settings.openai_model,
        "error": reason,
    }


def _normalize_first_analysis_summary(value: Any, computed: dict) -> dict[str, Any]:
    fallback = computed["first_summary_fallback"]
    source = value if isinstance(value, dict) else {}

    normalized = {
        "headline": _clean_summary_text(source.get("headline"), fallback["headline"]),
        "risk_level_summary": _clean_summary_text(
            source.get("risk_level_summary"),
            fallback["risk_level_summary"],
        ),
        "main_risk_cause": _clean_summary_text(
            source.get("main_risk_cause"),
            fallback["main_risk_cause"],
        ),
        "priority_action": _clean_summary_text(
            source.get("priority_action"),
            fallback["priority_action"],
        ),
        "focus_time_range": _clean_summary_text(
            source.get("focus_time_range"),
            fallback["focus_time_range"],
        ),
        "top_3_actions": _normalize_top_actions(source.get("top_3_actions"), fallback["top_3_actions"]),
    }
    if _is_procedure_summary(normalized["headline"]):
        normalized["headline"] = fallback["headline"]
    if _is_procedure_summary(normalized["priority_action"]):
        normalized["priority_action"] = fallback["priority_action"]
    return normalized


def _clean_summary_text(value: Any, fallback: str) -> str:
    text = str(value or "").strip()
    if not text or _is_procedure_summary(text):
        return fallback
    return text


def _normalize_top_actions(value: Any, fallback: list[str]) -> list[str]:
    if not isinstance(value, list):
        return fallback[:3]
    actions = [str(item).strip() for item in value if str(item or "").strip()]
    actions = [action for action in actions if not _is_procedure_summary(action)]
    if not actions:
        return fallback[:3]
    return actions[:3]
