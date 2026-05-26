import { localizeRiskText } from "./riskDisplay";

export function buildFirstSummary(llm, computed) {
  const source = llm?.first_analysis_summary || computed?.first_summary_fallback || {};
  const fallbackText = llm?.risk_summary
    || llm?.task_summary
    || computed?.fallback_risk_summary
    || "분석 결과 요약을 준비 중입니다.";
  const fallbackActions = computed?.recommended_action_seed || [];

  return {
    headline: localizeRiskText(source.headline || fallbackText),
    risk_level_summary: localizeRiskText(source.risk_level_summary || fallbackText),
    main_risk_cause: localizeRiskText(
      source.main_risk_cause || "주요 위험 원인을 계산된 근거와 함께 확인해야 합니다.",
    ),
    priority_action: localizeRiskText(
      source.priority_action || fallbackActions[0] || "작업 대상의 위치와 높이를 먼저 조정하세요.",
    ),
    focus_time_range: localizeRiskText(
      source.focus_time_range || "대표 고위험 구간을 먼저 확인하세요.",
    ),
    top_3_actions: Array.isArray(source.top_3_actions) && source.top_3_actions.length
      ? source.top_3_actions.slice(0, 3).map(localizeRiskText)
      : fallbackActions.slice(0, 3).map(localizeRiskText),
  };
}
