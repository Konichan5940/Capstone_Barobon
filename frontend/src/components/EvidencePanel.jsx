import { Hash, Layers3 } from "lucide-react";
import {
  formatBodyParts,
  formatDrivers,
  formatEvidenceId,
  formatSide,
  formatWindowTime,
  formatWindowTitle,
} from "../utils/riskDisplay";

export function EvidencePanel({ selectedWindow, frames }) {
  return (
    <section className="panel evidence-panel">
      <div className="panel-heading">
        <h3>근거 상세</h3>
        <span>{selectedWindow ? formatWindowTitle(selectedWindow.window_id) : "선택 없음"}</span>
      </div>

      {selectedWindow ? (
        <>
          <div className="evidence-meta">
            <span>
              <Hash size={14} /> 최고 점수 {selectedWindow.window_score_max}
            </span>
            <span>
              <Hash size={14} /> {formatEvidenceId(selectedWindow.window_id)}
            </span>
            <span>
              <Hash size={14} /> {formatWindowTime(selectedWindow.start_sec, selectedWindow.end_sec)}
            </span>
            <span>
              <Layers3 size={14} /> {formatBodyParts(selectedWindow.dominant_body_parts)}
            </span>
          </div>
          <div className="frame-grid">
            {frames.map((frame) => (
              <article className="frame-card" key={frame.frame_id}>
                <div>
                  <strong>{frame.frame_id}</strong>
                  <span>{frame.time_sec}s · {formatSide(frame.side)}</span>
                </div>
                <dl>
                  <dt>RULA</dt>
                  <dd>{frame.frame_score}</dd>
                  <dt>몸통</dt>
                  <dd>{frame.angles.trunk_deg ?? "-"}°</dd>
                  <dt>손목</dt>
                  <dd>{frame.angles.wrist_deg ?? "-"}°</dd>
                  <dt>목</dt>
                  <dd>{frame.angles.neck_deg ?? "-"}°</dd>
                </dl>
                <p>{formatDrivers(frame.drivers)}</p>
              </article>
            ))}
          </div>
        </>
      ) : (
        <p className="muted">위험 구간을 선택하면 대표 프레임이 표시됩니다.</p>
      )}
    </section>
  );
}
