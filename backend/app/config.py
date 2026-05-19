from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")


def _float_env(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except ValueError:
        return default


def _int_env(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    openai_api_key: str | None = os.getenv("OPENAI_API_KEY") or None
    openai_model: str = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
    openai_temperature: float = _float_env("OPENAI_TEMPERATURE", 0.1)
    openai_max_output_tokens: int = _int_env("OPENAI_MAX_OUTPUT_TOKENS", 1600)
    ollama_base_url: str = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
    ollama_model: str = os.getenv("OLLAMA_MODEL", "qwen3.5:9b")
    ollama_timeout_sec: int = _int_env("OLLAMA_TIMEOUT_SEC", 240)
    ollama_num_predict: int = _int_env("OLLAMA_NUM_PREDICT", 2048)
    high_risk_threshold: int = _int_env("HIGH_RISK_THRESHOLD", 6)
    max_upload_bytes: int = _int_env("MAX_UPLOAD_BYTES", 5 * 1024 * 1024)


settings = Settings()
