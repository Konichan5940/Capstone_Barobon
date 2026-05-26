import { Lightbulb, ShieldAlert } from "lucide-react";
import { formatDrivers, localizeRiskText } from "../utils/riskDisplay";

export function FindingsPanel({ findings, recommendations }) {
  return (
    <section className="findings-grid">
      <div className="panel">
        <div className="panel-heading">
          <h3>주요 위험 원인</h3>
          <ShieldAlert size={18} />
        </div>
        <div className="text-list">
          {findings.map((finding, index) => (
            <article key={`${finding.claim}-${index}`}>
              <p>{localizeRiskText(finding.claim)}</p>
              <div className="chips">
                {(finding.risk_factors || []).map((factor) => (
                  <span key={factor}>{localizeRiskText(factor)}</span>
                ))}
                {finding.evidence_ids.map((id) => (
                  <span key={id}>{id}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-heading">
          <h3>개선 권고</h3>
          <Lightbulb size={18} />
        </div>
        <div className="text-list">
          {recommendations.map((item, index) => (
            <article key={`${item.proposal}-${index}`}>
              <p>{localizeRiskText(item.proposal)}</p>
              <div className="chips">
                {(item.target_risk_factors || []).map((factor) => (
                  <span key={factor}>{formatDrivers([factor])}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
