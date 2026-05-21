from __future__ import annotations

import re
from typing import Any

MEDICAL_TERMS = ("진단", "질병", "치료", "허리디스크", "손목터널증후군")
PROCEDURE_SUMMARY_PHRASES = (
    "분석을 통해",
    "평가를 수행했습니다",
    "식별하고",
    "기반으로 인간공학적 평가",
    "작업 자세 분석을 통해",
)


def verify_llm_result(result: dict[str, Any], evidence_bundle: dict[str, Any]) -> dict[str, Any]:
    allowed_ids = set(evidence_bundle["allowed_evidence_ids"])
    invalid_evidence_ids: list[str] = []
    warnings: list[str] = []

    for evidence_id in _iter_evidence_ids(result):
        if evidence_id not in allowed_ids:
            invalid_evidence_ids.append(evidence_id)

    for text in _iter_text_values(result):
        if any(term in text for term in MEDICAL_TERMS):
            warnings.append("의학적 진단처럼 보일 수 있는 표현이 포함되어 있습니다.")
            break

    first_summary = result.get("first_analysis_summary") if isinstance(result.get("first_analysis_summary"), dict) else {}
    summary_texts = [
        str(result.get("risk_summary") or result.get("task_summary") or ""),
        str(first_summary.get("headline") or ""),
        str(first_summary.get("priority_action") or ""),
    ]
    if any(phrase in text for text in summary_texts for phrase in PROCEDURE_SUMMARY_PHRASES):
        warnings.append("요약문이 핵심 위험보다 분석 절차 설명에 가깝습니다.")

    unsupported_numbers = _unsupported_numbers(result, evidence_bundle)
    for number in unsupported_numbers[:5]:
        warnings.append(f"근거 데이터에서 직접 확인되지 않은 숫자 표현이 있습니다: {number}")

    return {
        "passed": not invalid_evidence_ids,
        "invalid_evidence_ids": sorted(set(invalid_evidence_ids)),
        "warnings": list(dict.fromkeys(warnings)),
        "checked_evidence_ids": sorted(allowed_ids),
    }


def _iter_evidence_ids(value: Any):
    if isinstance(value, dict):
        for key, child in value.items():
            if key == "evidence_ids" and isinstance(child, list):
                yield from [str(item) for item in child]
            else:
                yield from _iter_evidence_ids(child)
    elif isinstance(value, list):
        for item in value:
            yield from _iter_evidence_ids(item)


def _iter_text_values(value: Any):
    if isinstance(value, dict):
        for child in value.values():
            yield from _iter_text_values(child)
    elif isinstance(value, list):
        for item in value:
            yield from _iter_text_values(item)
    elif isinstance(value, str):
        yield value


def _unsupported_numbers(result: dict[str, Any], evidence_bundle: dict[str, Any]) -> list[str]:
    allowed = _allowed_number_strings(evidence_bundle)
    found = set()
    for text in _iter_text_values(result):
        found.update(re.findall(r"\d+(?:\.\d+)?", text))
    return sorted(number for number in found if number not in allowed)


def _allowed_number_strings(evidence_bundle: dict[str, Any]) -> set[str]:
    values: set[str] = set()

    def add(value: Any) -> None:
        if isinstance(value, (int, float)):
            values.add(str(int(value)) if float(value).is_integer() else str(round(float(value), 2)))
            values.add(str(round(float(value), 1)))
            values.add(str(round(float(value), 2)))
        elif isinstance(value, dict):
            for child in value.values():
                add(child)
        elif isinstance(value, list):
            for child in value:
                add(child)

    add(evidence_bundle["session_summary"])
    add(evidence_bundle.get("computed_summary", {}))
    add(evidence_bundle["high_risk_windows"])
    add(evidence_bundle["representative_frames"])
    add(evidence_bundle["peak_risk_event"])
    return values
