from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.config import settings
from app.services.errors import PipelineInputError
from app.services.pipeline import run_analysis

router = APIRouter()
SAMPLE_PATH = Path(__file__).resolve().parents[1] / "samples" / "barobon_analysis_result_2.json"


@router.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "llm_provider": "selectable",
        "llm_configured": {
            "openai": bool(settings.openai_api_key),
            "ollama": True,
        },
        "models": {
            "openai": settings.openai_model,
            "ollama": settings.ollama_model,
        },
        "high_risk_threshold": settings.high_risk_threshold,
        "video_analysis": {
            "available": True,
            "allowed_extensions": list(settings.allowed_video_extensions),
            "max_upload_mb": settings.max_video_upload_bytes // (1024 * 1024),
        },
    }


@router.get("/sample")
def sample() -> FileResponse:
    return FileResponse(SAMPLE_PATH, media_type="application/json", filename="barobon_analysis_result_2.json")


@router.post("/analyze")
async def analyze(file: UploadFile = File(...), provider: str = Form("openai")) -> dict:
    content = await file.read()
    try:
        return run_analysis(file.filename or "upload.json", content, provider=provider)
    except PipelineInputError as exc:
        raise HTTPException(status_code=400, detail={"message": exc.message, "details": exc.details}) from exc
