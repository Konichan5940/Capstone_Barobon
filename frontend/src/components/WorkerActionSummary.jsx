import { ListChecks, Target, Wrench } from "lucide-react";
import { buildFirstSummary } from "../utils/firstSummary";

export function WorkerActionSummary({ result }) {
  const firstSummary = buildFirstSummary(
    result.llm_result,
    result.evidence_bundle?.computed_summary,
  );
  const priorityActions = firstSummary.top_3_actions.length
    ? firstSummary.top_3_actions
    : [firstSummary.priority_action];

  return (
    <section className="panel worker-action-summary">
      <div className="worker-action-summary-grid">
        <ActionCard
          icon={<Target size={19} />}
          text={firstSummary.main_risk_cause}
          title="핵심 원인"
        />
        <ActionCard
          icon={<Wrench size={19} />}
          text={firstSummary.priority_action}
          title="먼저 고칠 것"
          tone="action"
        />
        <article className="worker-action-card priority">
          <div>
            <ListChecks size={19} />
            <strong>개선 우선순위</strong>
          </div>
          <ol>
            {priorityActions.map((action, index) => (
              <li key={`${action}-${index}`}>{action}</li>
            ))}
          </ol>
        </article>
      </div>
    </section>
  );
}

function ActionCard({ icon, text, title, tone = "" }) {
  return (
    <article className={`worker-action-card ${tone}`}>
      <div>
        {icon}
        <strong>{title}</strong>
      </div>
      <p>{text}</p>
    </article>
  );
}
