from __future__ import annotations

from app.services.evidence_builder import build_evidence_bundle
from app.services.llm_client import generate_llm_report
from app.services.normalizer import normalize_barobon_payload
from app.services.parser import parse_json_upload
from app.services.risk_window_builder import attach_risk_windows
from app.services.validator import validate_barobon_payload
from app.services.verifier import verify_llm_result


def run_analysis(filename: str, content: bytes, provider: str = "openai") -> dict:
    payload = parse_json_upload(filename, content)
    validation_warnings = validate_barobon_payload(payload)
    canonical = normalize_barobon_payload(payload, validation_warnings)
    canonical = attach_risk_windows(canonical)
    evidence_bundle = build_evidence_bundle(canonical)
    llm_result, llm_meta = generate_llm_report(evidence_bundle, provider=provider)
    verification = verify_llm_result(llm_result, evidence_bundle)

    return {
        "status": "ok",
        "input_summary": {
            "filename": filename,
            "requested_provider": llm_meta["requested_provider"],
            "total_frames": len(canonical["frames"]),
            "final_score": canonical["session_scores"]["final_score"],
            "frame_score_max": canonical["session_scores"]["frame_score_max"],
            "frame_score_avg": canonical["session_scores"]["frame_score_avg"],
            "high_risk_window_count": len(canonical["windows"]),
            "limitations": canonical["limitations"],
        },
        "canonical": canonical,
        "evidence_bundle": {
            "session_summary": evidence_bundle["session_summary"],
            "computed_summary": evidence_bundle["computed_summary"],
            "high_risk_windows": evidence_bundle["high_risk_windows"],
            "representative_frames": evidence_bundle["representative_frames"],
            "peak_risk_event": evidence_bundle["peak_risk_event"],
            "limitations": evidence_bundle["limitations"],
            "allowed_evidence_ids": evidence_bundle["allowed_evidence_ids"],
        },
        "llm_result": llm_result,
        "llm_meta": llm_meta,
        "verification": verification,
    }
