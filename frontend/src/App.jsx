import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { analyzePayload, analyzeVideo, healthCheck } from "./api/analyzeApi";
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
  const [videoPayload, setVideoPayload] = useState(null);
  const [videoMedia, setVideoMedia] = useState(null);
  const [videoSummary, setVideoSummary] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState("idle");
  const [selectedWindowId, setSelectedWindowId] = useState(null);
  const [health, setHealth] = useState(null);
  const [llmProvider, setLlmProvider] = useState("openai");
  const [loadKg, setLoadKg] = useState(5);
  const [legScore, setLegScore] = useState(1);

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
    const imageMap = result.media?.frame_image_data_urls || {};
    return result.canonical.frames
      .filter((frame) => ids.has(frame.frame_id))
      .map((frame) => ({
        ...frame,
        imageDataUrl: imageMap[frame.frame_id] || null,
      }));
  }, [result, selectedWindow]);

  const selectedImageFrames = useMemo(() => {
    if (!result || !selectedWindow) return [];
    const imageMap = result.media?.frame_image_data_urls || {};
    const framesById = new Map(result.canonical.frames.map((frame) => [frame.frame_id, frame]));
    const windowFrameIds = selectedWindow.frame_ids || selectedWindow.representative_frame_ids || [];
    const candidates = windowFrameIds
      .map((id) => framesById.get(id))
      .filter((frame) => frame && imageMap[frame.frame_id]);

    if (!candidates.length) return [];

    const representativeIds = new Set(selectedWindow.representative_frame_ids || []);
    const representativeImages = candidates.filter((frame) => representativeIds.has(frame.frame_id));
    const sourceFrames = representativeImages.length ? representativeImages : pickWindowImageFrames(candidates);

    return sourceFrames.map((frame) => ({
      ...frame,
      imageDataUrl: imageMap[frame.frame_id],
    }));
  }, [result, selectedWindow]);

  function handleFileChange(event) {
    const selected = event.target.files?.[0] || null;
    setFile(selected);
    setResult(null);
    setError("");
    setSelectedWindowId(null);
    setVideoPayload(null);
    setVideoMedia(null);
    setVideoSummary(null);

    if (!selected) {
      setPreview(null);
      setPhase("idle");
      return;
    }

    setPreview({
      type: selected.name.split(".").pop()?.toUpperCase() || selected.type || "VIDEO",
      size: formatBytes(selected.size),
    });
    setPhase("video-selected");
  }

  async function handleVideoAnalyze() {
    if (!file) return;
    setError("");
    setResult(null);
    setVideoPayload(null);
    setVideoMedia(null);
    setVideoSummary(null);
    setSelectedWindowId(null);
    setPhase("video-analyzing");

    try {
      const analysis = await analyzeVideo(file, { loadKg, legScore });
      setVideoPayload(analysis.payload);
      setVideoMedia(analysis.media);
      setVideoSummary(analysis.video_summary);
      setPhase("video-ready");
    } catch (err) {
      setError(err.message);
      setPhase(file ? "video-selected" : "idle");
    }
  }

  async function handleResultAnalyze() {
    if (!videoPayload) return;
    setError("");
    setResult(null);
    setSelectedWindowId(null);
    setPhase("llm-analyzing");

    try {
      const analysis = await analyzePayload({
        payload: videoPayload,
        provider: llmProvider,
        filename: file?.name || videoSummary?.filename || "video-analysis",
        media: videoMedia,
      });
      setResult(analysis);
      setSelectedWindowId(analysis.canonical.windows[0]?.window_id || null);
      setPhase("done");
    } catch (err) {
      setError(err.message);
      setPhase("video-ready");
    }
  }

  const isVideoAnalyzing = phase === "video-analyzing";
  const isResultAnalyzing = phase === "llm-analyzing";
  const canAnalyzeResult = Boolean(videoPayload?.time_series_data?.sec?.length);

  return (
    <main>
      <header className="topbar">
        <strong>RULA Video LLM Report</strong>
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
        videoSummary={videoSummary}
        llmProvider={llmProvider}
        loadKg={loadKg}
        legScore={legScore}
        isVideoAnalyzing={isVideoAnalyzing}
        isResultAnalyzing={isResultAnalyzing}
        canAnalyzeResult={canAnalyzeResult}
        onFileChange={handleFileChange}
        onLoadKgChange={setLoadKg}
        onLegScoreChange={setLegScore}
        onProviderChange={setLlmProvider}
        onVideoAnalyze={handleVideoAnalyze}
        onResultAnalyze={handleResultAnalyze}
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
            <EvidencePanel selectedWindow={selectedWindow} frames={selectedFrames} imageFrames={selectedImageFrames} />
          </section>
          <FindingsPanel findings={result.llm_result.key_findings} recommendations={result.llm_result.recommendations} />
          <LimitationsBox limitations={result.llm_result.limitations} verification={result.verification} />
        </>
      )}
    </main>
  );
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "-";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function pickWindowImageFrames(frames) {
  const first = frames[0];
  const peak = frames.reduce((best, frame) => (frame.frame_score > best.frame_score ? frame : best), first);
  const last = frames[frames.length - 1];
  return [first, peak, last].filter(
    (frame, index, selected) => frame && selected.findIndex((item) => item.frame_id === frame.frame_id) === index,
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
