from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.config import settings
from app.services.errors import PipelineInputError


def parse_json_upload(filename: str, content: bytes) -> dict[str, Any]:
    if not filename.lower().endswith(".json"):
        raise PipelineInputError("JSON 파일만 업로드할 수 있습니다.", ["확장자가 .json인지 확인하세요."])

    if not content:
        raise PipelineInputError("빈 파일은 분석할 수 없습니다.")

    if len(content) > settings.max_upload_bytes:
        raise PipelineInputError(
            "업로드 파일이 너무 큽니다.",
            [f"최대 크기는 {settings.max_upload_bytes // (1024 * 1024)}MB입니다."],
        )

    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise PipelineInputError("UTF-8 JSON 파일만 지원합니다.") from exc

    try:
        payload = json.loads(text)
    except json.JSONDecodeError as exc:
        raise PipelineInputError(
            "JSON 문법을 해석할 수 없습니다.",
            [f"{exc.lineno}행 {exc.colno}열 근처를 확인하세요."],
        ) from exc

    if not isinstance(payload, dict):
        raise PipelineInputError("최상위 JSON 값은 object여야 합니다.")

    return payload


def load_sample_payload(sample_path: Path) -> dict[str, Any]:
    return parse_json_upload(sample_path.name, sample_path.read_bytes())

