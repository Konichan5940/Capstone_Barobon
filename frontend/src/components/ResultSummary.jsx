import { AlertTriangle, BadgeCheck, Clock3, Gauge, ListChecks, Target, Wrench } from "lucide-react";
import { formatBodyParts, localizeRiskText } from "../utils/riskDisplay";
import { buildFirstSummary } from "../utils/firstSummary";
import { WorkerOverallSummary } from "./WorkerOverallSummary";

export function ResultSummary({ result, viewMode, onViewModeChange }) {
  if (!result) return null;
  const summary = result.input_summary;
  const llm = result.llm_result;
  const verification = result.verification;
  const computed = result.evidence_bundle?.computed_summary;
  const firstSummary = buildFirstSummary(llm, computed);
  const isUserView = viewMode === "user";
  const highlights = Array.isArray(llm.risk_highlights) && llm.risk_highlights.length
    ? llm.risk_highlights.map(localizeRiskText)
    : computed
      ? [
          `최종 보정 점수 ${computed.final_score}점`,
          `고위험 구간 ${computed.high_risk_window_count}개`,
          `주요 부위: ${formatBodyParts(computed.main_body_parts)}`,
        ]
      : [];

  return (
    <section className={`summary-band ${isUserView ? "" : "worker-mode"}`}>
      <div className="diagnosis-header">
        <div>
          <p className="eyebrow">{isUserView ? "첫 분석 요약" : "작업자 결과 요약"}</p>
          {isUserView && <h2>{firstSummary.headline}</h2>}
        </div>
        <div className="diagnosis-actions">
          <div className="view-mode-switch" role="group" aria-label="결과 화면 대상 선택">
            <button
              className={`view-mode-button ${isUserView ? "active" : ""}`}
              type="button"
              aria-pressed={isUserView}
              onClick={() => onViewModeChange("user")}
            >
              사용자용
            </button>
            <button
              className={`view-mode-button ${!isUserView ? "active" : ""}`}
              type="button"
              aria-pressed={!isUserView}
              onClick={() => onViewModeChange("worker")}
            >
              작업자용
            </button>
          </div>
          <span className={`status-pill ${verification.passed ? "ok" : "warn"}`}>
            {verification.passed ? <BadgeCheck size={16} /> : <AlertTriangle size={16} />}
            {verification.passed ? "근거 검증 통과" : "근거 확인 필요"}
          </span>
        </div>
      </div>

      {isUserView ? (
        <>
          <div className="first-summary-grid">
            <SummaryCard
              icon={<Gauge size={19} />}
              title="위험 판정"
              text={firstSummary.risk_level_summary}
            />
            <SummaryCard
              icon={<Target size={19} />}
              title="핵심 원인"
              text={firstSummary.main_risk_cause}
            />
            <SummaryCard
              icon={<Wrench size={19} />}
              title="먼저 고칠 것"
              text={firstSummary.priority_action}
              tone="action"
            />
            <SummaryCard
              icon={<Clock3 size={19} />}
              title="먼저 볼 구간"
              text={firstSummary.focus_time_range}
            />
          </div>

          {firstSummary.top_3_actions.length > 0 && (
            <div className="top-actions">
              <strong>개선 우선순위</strong>
              <ol>
                {firstSummary.top_3_actions.map((action, index) => (
                  <li key={`${action}-${index}`}>{action}</li>
                ))}
              </ol>
            </div>
          )}
        </>
      ) : (
        <WorkerOverallSummary
          averageScore={summary.frame_score_avg}
          frames={result.canonical.frames}
          headline={firstSummary.headline}
          mainBodyParts={computed?.main_body_parts}
          samplingHz={result.canonical.task.sampling_hz}
          windows={result.canonical.windows}
        />
      )}

      {isUserView && highlights.length > 0 && (
        <ul className="risk-highlights">
          {highlights.map((item, index) => (
            <li key={`${item}-${index}`}>{item}</li>
          ))}
        </ul>
      )}

      {isUserView && (
        <>
          <div className="metric-row">
            <ScoreMetric icon={<Gauge size={20} />} label="최종 보정 점수" value={summary.final_score} tone="danger" />
            <ScoreMetric icon={<Gauge size={20} />} label="프레임 최고 점수" value={summary.frame_score_max} tone="amber" />
            <ScoreMetric icon={<ListChecks size={20} />} label="고위험 구간" value={summary.high_risk_window_count} tone="teal" />
          </div>

          <div className="assessment-line">
            <strong>{llm.overall_assessment.severity_label}</strong>
            <span>평균 프레임 점수 {summary.frame_score_avg}</span>
            <span>
              {result.llm_meta.requested_provider === "ollama" ? "Qwen3.5 9B" : "GPT-4.1 mini"} ·{" "}
              {result.llm_meta.mode === "fallback" ? "fallback 리포트" : result.llm_meta.model}
            </span>
          </div>
        </>
      )}
    </section>
  );
}

function SummaryCard({ icon, title, text, tone = "" }) {
  return (
    <article className={`first-summary-card ${tone}`}>
      <div>
        {icon}
        <strong>{title}</strong>
      </div>
      <p>{text}</p>
    </article>
  );
}

function ScoreMetric({ icon, label, value, tone }) {
  return (
    <div className={`score-metric ${tone}`}>
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
