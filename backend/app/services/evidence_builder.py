from __future__ import annotations

from collections import Counter

BODY_PART_LABELS = {
    "trunk": "몸통",
    "neck": "목",
    "wrist": "손목",
    "upper_arm": "상완",
    "lower_arm": "전완",
    "shoulder": "어깨",
    "leg": "다리",
    "unknown": "알 수 없음",
}

DRIVER_LABELS = {
    "trunk_flexion": "몸통 굴곡",
    "trunk_twist": "몸통 비틀림",
    "neck_flexion": "목 굴곡",
    "neck_twist": "목 비틀림",
    "wrist_angle": "손목 부담",
    "wrist_deviation": "손목 편위",
    "upper_arm_elevation": "상완 거상",
    "arm_abduction": "상완 벌림",
    "repetition_or_static": "반복/정적 자세",
    "heavy_load": "과도한 하중",
}

ACTION_BY_DRIVER = {
    "trunk_twist": "작업 대상을 몸 정면에 배치해 몸통을 틀지 않아도 되게 조정하세요.",
    "trunk_flexion": "작업대 높이나 대상물 위치를 올려 몸을 깊게 숙이는 동작을 줄이세요.",
    "neck_twist": "시선 방향과 작업 방향이 일치하도록 대상물이나 화면 위치를 조정하세요.",
    "neck_flexion": "대상물을 눈높이에 가깝게 배치해 목을 숙이는 시간을 줄이세요.",
    "wrist_angle": "손목이 꺾이지 않도록 작업 높이와 도구 방향을 조정하세요.",
    "wrist_deviation": "손목을 옆으로 꺾거나 비트는 동작을 줄이도록 손잡이 방향을 바꾸세요.",
    "upper_arm_elevation": "팔을 몸 가까이에 둘 수 있도록 작업 거리를 줄이세요.",
    "arm_abduction": "팔을 벌린 상태가 오래 유지되지 않도록 대상물을 몸 가까이에 배치하세요.",
    "repetition_or_static": "같은 자세가 반복되지 않도록 작업을 나누고 짧은 휴식 구간을 넣으세요.",
    "heavy_load": "하중을 줄이거나 보조 장비 사용을 먼저 검토하세요.",
}


def build_evidence_bundle(canonical: dict) -> dict:
    representative_frame_ids = _representative_frame_ids(canonical)
    representative_frames = [
        frame for frame in canonical["frames"] if frame["frame_id"] in representative_frame_ids
    ]
    allowed_evidence_ids = [window["window_id"] for window in canonical["windows"]] + [
        frame["frame_id"] for frame in representative_frames
    ]
    bundle = {
        "session_summary": {
            "assessment_method": canonical["task"]["assessment_method"],
            "duration_sec": canonical["task"]["duration_sec"],
            "final_score": canonical["session_scores"]["final_score"],
            "final_action": canonical["session_scores"]["final_action"],
            "frame_score_max": canonical["session_scores"]["frame_score_max"],
            "frame_score_avg": canonical["session_scores"]["frame_score_avg"],
            "score_adjustments": canonical["session_scores"]["score_adjustments"],
        },
        "high_risk_windows": canonical["windows"],
        "computed_summary": _build_computed_summary(canonical),
        "representative_frames": representative_frames,
        "peak_risk_event": canonical["peak_risk_event"],
        "limitations": canonical["limitations"],
        "allowed_evidence_ids": allowed_evidence_ids,
        "evidence_text": "",
    }
    bundle["evidence_text"] = _render_evidence_text(bundle)
    return bundle


def _representative_frame_ids(canonical: dict) -> list[str]:
    ids: list[str] = []
    for window in canonical["windows"]:
        ids.extend(window["representative_frame_ids"])
    ids.append(canonical["peak_risk_event"]["frame_id"])
    if not ids:
        ids.extend(frame["frame_id"] for frame in canonical["frames"][:3])
    return list(dict.fromkeys(ids))


def _build_computed_summary(canonical: dict) -> dict:
    windows = canonical["windows"]
    session = canonical["session_scores"]
    raw_drivers = _top_raw_values(
        driver
        for window in windows
        for driver in window.get("drivers", [])
    )
    body_parts = _top_labels(
        part
        for window in windows
        for part in window.get("dominant_body_parts", [])
    )
    drivers = [_driver_label(driver) for driver in raw_drivers]

    adjustment_drivers = [
        key
        for key, enabled in session.get("score_adjustments", {}).items()
        if enabled and key in DRIVER_LABELS
    ]
    raw_drivers = _dedupe([*raw_drivers, *adjustment_drivers])
    drivers = _dedupe([*drivers, *[_driver_label(driver) for driver in adjustment_drivers]])[:5]
    high_risk_times = [_format_window_time(window["start_sec"], window["end_sec"]) for window in windows]
    priority_focus_windows = _priority_focus_windows(canonical)
    recommended_actions = _recommended_actions(raw_drivers)

    if not body_parts:
        body_parts = ["알 수 없음"]
    if not drivers:
        drivers = ["알 수 없음"]
    if not recommended_actions:
        recommended_actions = ["작업 대상의 위치와 높이를 먼저 조정해 부담이 큰 자세를 줄이세요."]

    primary_driver = drivers[0]
    supporting_drivers = drivers[1:4]

    summary = {
        "final_score": session["final_score"],
        "final_action": session["final_action"],
        "frame_score_max": session["frame_score_max"],
        "frame_score_avg": session["frame_score_avg"],
        "high_risk_window_count": len(windows),
        "main_body_parts": body_parts[:5],
        "main_drivers": drivers[:5],
        "primary_driver": primary_driver,
        "supporting_drivers": supporting_drivers,
        "high_risk_times": high_risk_times,
        "priority_focus_windows": priority_focus_windows,
        "recommended_action_seed": recommended_actions[:3],
        "fallback_risk_summary": _fallback_summary_text(
            session["final_score"],
            session["final_action"],
            len(windows),
            body_parts[:5],
            drivers[:5],
            high_risk_times,
        ),
        "risk_highlights": [
            f"최종 보정 점수 {session['final_score']}점으로 {session['final_action']}",
            f"고위험 구간 {len(windows)}개 확인",
            f"주요 부위: {', '.join(body_parts[:3])}",
        ],
    }
    summary["first_summary_fallback"] = _first_summary_fallback(summary)
    return summary


def _render_evidence_text(bundle: dict) -> str:
    lines = ["<computed_summary>"]
    for key, value in bundle["computed_summary"].items():
        lines.append(f"- {key}: {value}")
    lines.append("</computed_summary>")

    lines.append("<session_summary>")
    for key, value in bundle["session_summary"].items():
        lines.append(f"- {key}: {value}")
    lines.append("</session_summary>")

    lines.append("<high_risk_windows>")
    for window in bundle["high_risk_windows"]:
        lines.append(
            f'<window id="{window["window_id"]}" time="{window["start_sec"]}~{window["end_sec"]}">'
        )
        lines.append(f"- max_score: {window['window_score_max']}")
        lines.append(f"- body_parts: {', '.join(window['dominant_body_parts']) or 'unknown'}")
        lines.append(f"- drivers: {', '.join(window['drivers']) or 'unknown'}")
        lines.append(f"- representative_frames: {', '.join(window['representative_frame_ids'])}")
        lines.append("</window>")
    lines.append("</high_risk_windows>")

    lines.append("<representative_frames>")
    for frame in bundle["representative_frames"]:
        lines.append(f'<frame id="{frame["frame_id"]}" time_sec="{frame["time_sec"]}">')
        lines.append(f"- frame_score: {frame['frame_score']}")
        lines.append(f"- side: {frame['side']}")
        lines.append(f"- angles: {frame['angles']}")
        lines.append(f"- flags: {frame['flags']}")
        lines.append(f"- drivers: {frame['drivers']}")
        lines.append("</frame>")
    lines.append("</representative_frames>")

    lines.append("<limitations>")
    for limitation in bundle["limitations"]:
        lines.append(f"- {limitation}")
    lines.append("</limitations>")
    return "\n".join(lines)


def _top_labels(values) -> list[str]:
    counter = Counter(value for value in values if value)
    return [_body_part_label(value) if value in BODY_PART_LABELS else _driver_label(value) for value, _ in counter.most_common()]


def _top_raw_values(values) -> list[str]:
    counter = Counter(value for value in values if value)
    return [value for value, _ in counter.most_common()]


def _body_part_label(value: str) -> str:
    return BODY_PART_LABELS.get(value, value or "알 수 없음")


def _driver_label(value: str) -> str:
    return DRIVER_LABELS.get(value, value or "알 수 없음")


def _dedupe(values: list[str]) -> list[str]:
    return list(dict.fromkeys(value for value in values if value))


def _format_window_time(start_sec, end_sec) -> str:
    return f"{_format_time(start_sec)} - {_format_time(end_sec)}"


def _format_time(value) -> str:
    seconds = float(value)
    if not seconds.is_integer():
        return f"{round(seconds, 1)}s"
    seconds = int(seconds)
    minutes, remainder = divmod(seconds, 60)
    return f"{minutes:02d}:{remainder:02d}"


def _priority_focus_windows(canonical: dict) -> list[dict]:
    windows = canonical["windows"]
    peak_frame_id = canonical["peak_risk_event"].get("frame_id")

    def rank(window: dict) -> tuple:
        has_peak = peak_frame_id in window.get("frame_ids", [])
        return (
            1 if window.get("window_score_max") >= 7 else 0,
            float(window.get("duration_sec") or 0),
            len(window.get("drivers") or []),
            1 if has_peak else 0,
            float(window.get("window_score_max") or 0),
        )

    selected = sorted(windows, key=rank, reverse=True)[:3]
    return [
        {
            "window_id": window["window_id"],
            "time": _format_window_time(window["start_sec"], window["end_sec"]),
            "reason": _focus_window_reason(window, peak_frame_id),
            "drivers": [_driver_label(driver) for driver in window.get("drivers", [])[:3]],
        }
        for window in selected
    ]


def _focus_window_reason(window: dict, peak_frame_id: str | None) -> str:
    if peak_frame_id in window.get("frame_ids", []):
        return "최고 위험 시점이 포함된 대표 구간"
    if float(window.get("duration_sec") or 0) >= 2:
        return "고위험 자세가 연속으로 이어진 구간"
    if len(window.get("drivers") or []) >= 2:
        return "여러 위험 요인이 함께 나타난 구간"
    return "고위험 점수가 확인된 구간"


def _recommended_actions(raw_drivers: list[str]) -> list[str]:
    actions = [ACTION_BY_DRIVER[driver] for driver in raw_drivers if driver in ACTION_BY_DRIVER]
    return _dedupe(actions)


def _first_summary_fallback(summary: dict) -> dict:
    primary = summary["primary_driver"]
    supporting = summary["supporting_drivers"]
    body_parts = summary["main_body_parts"]
    actions = summary["recommended_action_seed"]
    focus_windows = summary["priority_focus_windows"]

    headline = (
        f"{primary}을 중심으로 {', '.join(body_parts[:3])} 부담이 함께 나타나는 작업입니다."
        if primary != "알 수 없음"
        else f"최종 보정 점수 {summary['final_score']}점으로 {summary['final_action']} 수준입니다."
    )
    supporting_text = f" 이와 함께 {', '.join(supporting)}도 같이 나타났습니다." if supporting else ""
    focus_text = _focus_time_summary(focus_windows)
    return {
        "headline": headline,
        "risk_level_summary": (
            f"최종 보정 점수는 {summary['final_score']}점으로 {summary['final_action']} 수준이며, "
            f"고위험 구간 {summary['high_risk_window_count']}개가 확인되었습니다."
        ),
        "main_risk_cause": (
            f"가장 큰 원인은 {primary}입니다.{supporting_text} "
            "여러 부담이 같은 구간에서 겹치며 전체 위험 수준을 높인 것으로 보입니다."
        ),
        "priority_action": actions[0],
        "focus_time_range": focus_text,
        "top_3_actions": actions[:3],
    }


def _focus_time_summary(focus_windows: list[dict]) -> str:
    if not focus_windows:
        return "뚜렷한 고위험 구간은 제한적으로 확인되며, 최고 위험 시점 주변을 먼저 확인하세요."
    pieces = [f"{window['time']}({window['reason']})" for window in focus_windows[:3]]
    return f"먼저 {', '.join(pieces)}을 확인하세요."


def _fallback_summary_text(
    final_score: int,
    final_action: str,
    high_risk_window_count: int,
    main_body_parts: list[str],
    main_drivers: list[str],
    high_risk_times: list[str],
) -> str:
    time_text = ", ".join(high_risk_times[:4]) if high_risk_times else "특정 고위험 구간 없음"
    return (
        f"최종 보정 점수는 {final_score}점으로 {final_action} 수준이며, "
        f"전체 작업 중 {high_risk_window_count}개의 고위험 구간이 확인되었습니다. "
        f"주요 위험 부위는 {', '.join(main_body_parts)}이고, "
        f"주요 자세 요인은 {', '.join(main_drivers)}입니다. "
        f"위험은 {time_text} 구간에 집중되었습니다."
    )
