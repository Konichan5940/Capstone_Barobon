import { Clock, LocateFixed } from "lucide-react";
import { formatBodyParts, formatEvidenceId, formatWindowTime, formatWindowTitle } from "../utils/riskDisplay";

export function RiskWindowList({ windows, selectedId, onSelect }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h3>위험 구간</h3>
        <span>{windows.length}개</span>
      </div>
      <div className="window-list">
        {windows.map((window) => (
          <button
            className={`window-item ${selectedId === window.window_id ? "selected" : ""}`}
            key={window.window_id}
            type="button"
            onClick={() => onSelect(window.window_id)}
          >
            <div>
              <strong>{formatWindowTitle(window.window_id)}</strong>
              <span>
                <Clock size={14} /> {formatWindowTime(window.start_sec, window.end_sec)}
              </span>
              <small>{formatEvidenceId(window.window_id)}</small>
            </div>
            <div>
              <b>최고 점수 {window.window_score_max}</b>
              <span>
                <LocateFixed size={14} /> {formatBodyParts(window.dominant_body_parts)}
              </span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
