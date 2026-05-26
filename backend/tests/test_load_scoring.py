from __future__ import annotations

from app.video_analyzer import analyzer_sec
from app.video_analyzer.rula_engine import RULAEngine


def _evaluate_with_load(monkeypatch, load_kg: float):
    angles = iter((20.0, 90.0, 120.0))
    monkeypatch.setattr(analyzer_sec, "calculate_angle_3d", lambda *args, **kwargs: next(angles))
    monkeypatch.setattr(analyzer_sec, "calculate_angle_projected", lambda *args, **kwargs: 0.0)
    monkeypatch.setattr(analyzer_sec, "calculate_wrist_twist", lambda *args, **kwargs: 1)
    points = {
        "shoulder": [0.0, 0.0, 0.0, 1.0],
        "elbow": [0.0, 0.5, 0.0, 1.0],
        "wrist": [0.0, 1.0, 0.0, 1.0],
        "hip": [0.0, 1.0, 0.0, 1.0],
        "ear": [0.0, -1.0, 0.0, 1.0],
        "index": [0.0, 1.2, 0.0, 1.0],
    }
    return analyzer_sec.eval_side(RULAEngine(), points, None, load_kg)


def test_load_below_two_kg_does_not_change_frame_score_or_wrist_angle(monkeypatch) -> None:
    without_load = _evaluate_with_load(monkeypatch, 0.0)
    one_kg_load = _evaluate_with_load(monkeypatch, 1.0)

    assert without_load.wrist == one_kg_load.wrist == 60.0
    assert without_load.rula_score == one_kg_load.rula_score

