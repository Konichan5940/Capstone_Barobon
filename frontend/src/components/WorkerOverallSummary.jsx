import { Clock3, Layers3, ListChecks } from "lucide-react";
import { formatBodyParts } from "../utils/riskDisplay";
import {
  calculateHighRiskAccumulatedSeconds,
  formatAccumulatedDuration,
  getWorkerRiskLevel,
} from "../utils/workerRiskMetrics";

export function WorkerOverallSummary({
  headline,
  averageScore,
  windows = [],
  frames = [],
  samplingHz,
  mainBodyParts = [],
}) {
  const riskLevel = getWorkerRiskLevel(averageScore);
  const accumulatedSeconds = calculateHighRiskAccumulatedSeconds(windows, frames, samplingHz);
  const primaryBodyPart = mainBodyParts.length
    ? formatBodyParts([mainBodyParts[0]])
    : "확인 필요";

  return (
    <div className="worker-summary-card">
      <div className={`worker-risk-level ${riskLevel.key}`}>
        <p className="worker-risk-title">전체 위험 수준</p>
        <span className="worker-risk-chip">{riskLevel.label}</span>
        <p className="worker-risk-score">평균 RULA <b>{formatScore(averageScore)}</b></p>
      </div>
      <div className="worker-summary-main">
        <div className="worker-summary-headline">
          <span>핵심 한 줄 요약</span>
          <p>{headline}</p>
        </div>
        <div className="worker-summary-metrics">
          <WorkerMetric icon={<ListChecks size={18} />} label="위험 구간 개수" value={`${windows.length}개`} />
          <WorkerMetric icon={<Layers3 size={18} />} label="가장 부담이 큰 신체 부위" value={primaryBodyPart} />
          <WorkerMetric
            icon={<Clock3 size={18} />}
            label="높은 위험 이상 누적 시간"
            value={formatAccumulatedDuration(accumulatedSeconds)}
          />
        </div>
      </div>
    </div>
  );
}

function WorkerMetric({ icon, label, value }) {
  return (
    <div className="worker-summary-metric">
      <span>
        {icon}
        {label}
      </span>
      <strong>{value}</strong>
    </div>
  );
}

function formatScore(score) {
  const numericScore = Number(score);
  return Number.isFinite(numericScore) ? numericScore.toFixed(2) : "-";
}
