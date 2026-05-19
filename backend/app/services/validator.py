from __future__ import annotations

from typing import Any

from app.services.errors import PipelineInputError

REQUIRED_NUMERIC_SERIES = ("sec", "rula")
OPTIONAL_NUMERIC_SERIES = ("trunk", "elbow", "upper_arm", "neck", "wrist", "twist")
SUPPORTED_SIDE_VALUES = {"left", "right", "unknown", ""}


def validate_barobon_payload(payload: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    warnings: list[str] = []

    summary = payload.get("summary")
    if not isinstance(summary, dict):
        errors.append("summary object가 필요합니다.")
    else:
        if not _is_number(summary.get("score")):
            errors.append("summary.score 숫자가 필요합니다.")
        if not _is_number(summary.get("total")):
            errors.append("summary.total 숫자가 필요합니다.")

    time_series = payload.get("time_series_data")
    if not isinstance(time_series, dict):
        errors.append("time_series_data object가 필요합니다.")
    else:
        errors.extend(_validate_time_series(time_series, warnings))

    if errors:
        raise PipelineInputError("입력 JSON 스키마가 올바르지 않습니다.", errors)

    if "metadata" not in payload:
        warnings.append("metadata가 없어 작업물 무게와 다리 조건은 unknown으로 처리합니다.")
    if "peak_risk_event" not in payload:
        warnings.append("peak_risk_event가 없어 프레임 점수에서 최고 위험 시점을 계산합니다.")

    return warnings


def _validate_time_series(time_series: dict[str, Any], warnings: list[str]) -> list[str]:
    errors: list[str] = []
    lengths: dict[str, int] = {}

    for key in REQUIRED_NUMERIC_SERIES:
        value = time_series.get(key)
        if not isinstance(value, list) or not value:
            errors.append(f"time_series_data.{key} 배열이 필요합니다.")
            continue
        lengths[key] = len(value)
        bad_index = _first_non_number_index(value)
        if bad_index is not None:
            errors.append(f"time_series_data.{key}[{bad_index}] 값은 숫자여야 합니다.")

    expected_length = lengths.get("sec")
    if expected_length is None:
        return errors

    for key in OPTIONAL_NUMERIC_SERIES:
        value = time_series.get(key)
        if value is None:
            warnings.append(f"time_series_data.{key}가 없어 해당 각도/점수 근거는 생략합니다.")
            continue
        if not isinstance(value, list):
            errors.append(f"time_series_data.{key}는 배열이어야 합니다.")
            continue
        if len(value) != expected_length:
            errors.append(
                f"time_series_data.{key} 길이({len(value)})가 sec 길이({expected_length})와 다릅니다."
            )
        bad_index = _first_non_number_index(value)
        if bad_index is not None:
            errors.append(f"time_series_data.{key}[{bad_index}] 값은 숫자여야 합니다.")

    flags = time_series.get("flags")
    if flags is None:
        warnings.append("time_series_data.flags가 없어 twist/deviation 근거는 unknown으로 처리합니다.")
    elif not isinstance(flags, list):
        errors.append("time_series_data.flags는 배열이어야 합니다.")
    else:
        if len(flags) != expected_length:
            errors.append(
                f"time_series_data.flags 길이({len(flags)})가 sec 길이({expected_length})와 다릅니다."
            )
        for index, value in enumerate(flags):
            if not isinstance(value, dict):
                errors.append(f"time_series_data.flags[{index}]는 object여야 합니다.")
                break

    sides = time_series.get("side")
    if sides is None:
        warnings.append("time_series_data.side가 없어 좌우 구분은 unknown으로 처리합니다.")
    elif not isinstance(sides, list):
        errors.append("time_series_data.side는 배열이어야 합니다.")
    else:
        if len(sides) != expected_length:
            errors.append(
                f"time_series_data.side 길이({len(sides)})가 sec 길이({expected_length})와 다릅니다."
            )
        for index, side in enumerate(sides):
            normalized = str(side).strip().lower()
            if normalized not in SUPPORTED_SIDE_VALUES:
                errors.append(f"time_series_data.side[{index}] 값 '{side}'는 left/right/unknown만 지원합니다.")
                break

    return errors


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _first_non_number_index(values: list[Any]) -> int | None:
    for index, value in enumerate(values):
        if not _is_number(value):
            return index
    return None

