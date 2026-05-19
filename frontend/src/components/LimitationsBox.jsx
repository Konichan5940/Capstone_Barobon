import { AlertCircle } from "lucide-react";

export function LimitationsBox({ limitations, verification }) {
  const warnings = verification?.warnings || [];
  return (
    <section className="limitations">
      <div className="panel-heading">
        <h3>한계 및 검증 메모</h3>
        <AlertCircle size={18} />
      </div>
      <ul>
        {[...limitations, ...warnings].map((item, index) => (
          <li key={`${item}-${index}`}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

