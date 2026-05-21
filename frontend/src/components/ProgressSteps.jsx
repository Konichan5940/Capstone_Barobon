import { CheckCircle2, CircleDashed, Loader2 } from "lucide-react";

const STEPS = ["영상 업로드", "영상 분석", "시계열 변환", "LLM 분석", "검증 완료"];

const PHASES = {
  idle: { doneThrough: 0, activeIndex: -1 },
  "video-selected": { doneThrough: 0, activeIndex: 0 },
  "video-analyzing": { doneThrough: 1, activeIndex: 1 },
  "video-ready": { doneThrough: 3, activeIndex: -1 },
  "llm-analyzing": { doneThrough: 3, activeIndex: 3 },
  done: { doneThrough: STEPS.length, activeIndex: -1 },
};

export function ProgressSteps({ phase }) {
  const status = PHASES[phase] || PHASES.idle;

  return (
    <section className="progress-band" aria-label="분석 진행 상태">
      {STEPS.map((step, index) => {
        const done = status.doneThrough > index;
        const active = status.activeIndex === index;
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
