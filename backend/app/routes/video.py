from __future__ import annotations

from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from app.services.errors import PipelineInputError
from app.services.pipeline import run_analysis_payload
from app.services.video_adapter import analyze_video_upload

router = APIRouter()


class PayloadAnalysisRequest(BaseModel):
    payload: dict[str, Any]
    provider: str = "openai"
    filename: str = "video-analysis"
    media: dict[str, Any] | None = None


@router.post("/video/analyze")
async def analyze_video(
    file: UploadFile = File(...),
    load_kg: float = Form(5.0),
    leg_score: int = Form(1),
) -> dict:
    content = await file.read()
    try:
        return await run_in_threadpool(
            analyze_video_upload,
            file.filename or "upload.mp4",
            content,
            load_kg,
            leg_score,
        )
    except PipelineInputError as exc:
        raise HTTPException(status_code=400, detail={"message": exc.message, "details": exc.details}) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail={
                "message": "영상 분석 중 서버 오류가 발생했습니다.",
                "details": [str(exc)],
            },
        ) from exc


@router.post("/analyze-payload")
async def analyze_payload(request: PayloadAnalysisRequest) -> dict:
    try:
        return await run_in_threadpool(
            run_analysis_payload,
            request.payload,
            request.filename,
            request.provider,
            request.media,
        )
    except PipelineInputError as exc:
        raise HTTPException(status_code=400, detail={"message": exc.message, "details": exc.details}) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail={
                "message": "결과분석 중 서버 오류가 발생했습니다.",
                "details": [str(exc)],
            },
        ) from exc
