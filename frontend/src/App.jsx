import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { analyzeJson, healthCheck } from "./api/analyzeApi";
import { EvidencePanel } from "./components/EvidencePanel";
import { FindingsPanel } from "./components/FindingsPanel";
import { LimitationsBox } from "./components/LimitationsBox";
import { ProgressSteps } from "./components/ProgressSteps";
import { ResultSummary } from "./components/ResultSummary";
import { RulaScoreChart } from "./components/RulaScoreChart";
import { RiskWindowList } from "./components/RiskWindowList";
import { UploadPanel } from "./components/UploadPanel";
import "./styles.css";

function App() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState("idle");
  const [selectedWindowId, setSelectedWindowId] = useState(null);
  const [health, setHealth] = useState(null);
  const [llmProvider, setLlmProvider] = useState("openai");

  useEffect(() => {
    healthCheck().then(setHealth).catch(() => setHealth({ status: "offline" }));
  }, []);

  const selectedWindow = useMemo(() => {
    const windows = result?.canonical?.windows || [];
    return windows.find((window) => window.window_id === selectedWindowId) || windows[0] || null;
  }, [result, selectedWindowId]);

  const selectedFrames = useMemo(() => {
    if (!result || !selectedWindow) return [];
    const ids = new Set(selectedWindow.representative_frame_ids);
    return result.canonical.frames.filter((frame) => ids.has(frame.frame_id));
  }, [result, selectedWindow]);

  async function handleFileChange(event) {
    const selected = event.target.files?.[0] || null;
    setFile(selected);
    setResult(null);
    setError("");
    setSelectedWindowId(null);
    if (!selected) {
      setPreview(null);
      return;
    }
    try {
      const text = await selected.text();
      const payload = JSON.parse(text);
      const rula = payload?.time_series_data?.rula || [];
      setPreview({
        finalScore: payload?.summary?.score,
        totalFrames: payload?.summary?.total || payload?.time_series_data?.sec?.length,
        frameMax: rula.length ? Math.max(...rula) : "-",
        shape: payload?.time_series_data ? "Barobon columnar" : "unknown",
      });
    } catch {
      setPreview({ finalScore: "-", totalFrames: "-", frameMax: "-", shape: "JSON 확인 필요" });
    }
  }

  async function handleAnalyze() {
    if (!file) return;
    setError("");
    setResult(null);
    const phases = [0, 1, 2, 3];
    let timerIndex = 0;
    setPhase(phases[timerIndex]);
    const timer = window.setInterval(() => {
      timerIndex = Math.min(timerIndex + 1, phases.length - 1);
      setPhase(phases[timerIndex]);
    }, 550);
    try {
      const analysis = await analyzeJson(file, llmProvider);
      setResult(analysis);
      setSelectedWindowId(analysis.canonical.windows[0]?.window_id || null);
      setPhase("done");
    } catch (err) {
      setError(err.message);
      setPhase("idle");
    } finally {
      window.clearInterval(timer);
    }
  }

  return (
    <main>
      <header className="topbar">
        <strong>RULA JSON LLM Report</strong>
        <span className={health?.status === "ok" ? "health good" : "health"}>
          {health?.status === "ok"
            ? health.llm_configured?.openai
              ? "GPT-4.1 mini 설정됨"
              : "GPT 키 없음 · Qwen3.5 선택 가능"
            : "Backend 대기"}
        </span>
      </header>

      <UploadPanel
        file={file}
        preview={preview}
        llmProvider={llmProvider}
        isAnalyzing={typeof phase === "number"}
        onFileChange={handleFileChange}
        onProviderChange={setLlmProvider}
        onAnalyze={handleAnalyze}
      />

      <ProgressSteps phase={phase} />

      {error && <pre className="error-box">{error}</pre>}

      <ResultSummary result={result} />

      {result && (
        <>
          <RulaScoreChart frames={result.canonical.frames} windows={result.canonical.windows} />
          <section className="workspace-grid">
            <RiskWindowList
              windows={result.canonical.windows}
              selectedId={selectedWindow?.window_id}
              onSelect={setSelectedWindowId}
            />
            <EvidencePanel selectedWindow={selectedWindow} frames={selectedFrames} />
          </section>
          <FindingsPanel findings={result.llm_result.key_findings} recommendations={result.llm_result.recommendations} />
          <LimitationsBox limitations={result.llm_result.limitations} verification={result.verification} />
        </>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
