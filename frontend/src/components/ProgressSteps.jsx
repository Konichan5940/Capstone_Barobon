import { CheckCircle2, CircleDashed, Loader2 } from "lucide-react";

const STEPS = ["JSON 검증", "정규화", "근거 생성", "LLM 분석", "검증 완료"];

export function ProgressSteps({ phase }) {
  const activeIndex = phase === "idle" ? -1 : phase === "done" ? STEPS.length : phase;

  return (
    <section className="progress-band" aria-label="분석 진행 상태">
      {STEPS.map((step, index) => {
        const done = activeIndex > index;
        const active = activeIndex === index;
        return (
          <div className={`step ${done ? "done" : ""} ${active ? "active" : ""}`} key={step}>
            {done ? <CheckCircle2 size={18} /> : active ? <Loader2 className="spin" size={18} /> : <CircleDashed size={18} />}
            <span>{step}</span>
          </div>
        );
      })}
    </section>
  );
}

