import { Bot, ChevronDown, FileVideo, Loader2, Play, Settings2, Upload } from "lucide-react";

export function UploadPanel({
  file,
  preview,
  videoSummary,
  llmProvider,
  loadKg,
  legScore,
  isVideoAnalyzing,
  isResultAnalyzing,
  canAnalyzeResult,
  onFileChange,
  onLoadKgChange,
  onLegScoreChange,
  onProviderChange,
  onVideoAnalyze,
  onResultAnalyze,
}) {
  const isBusy = isVideoAnalyzing || isResultAnalyzing;

  return (
    <section className="upload-band">
      <div className="upload-copy">
        <p className="eyebrow">영상 분석 통합</p>
        <h1>Barobon RULA 리포트</h1>
      </div>

      <div className="upload-controls">
        <label className="file-drop">
          <Upload size={20} aria-hidden="true" />
          <span>{file ? file.name : "영상 파일 선택"}</span>
          <input
            type="file"
            accept="video/mp4,video/quicktime,video/x-msvideo,.mp4,.mov,.avi"
            onChange={onFileChange}
            disabled={isBusy}
          />
        </label>
        <button className="primary-action" type="button" onClick={onVideoAnalyze} disabled={!file || isBusy}>
          {isVideoAnalyzing ? <Loader2 className="spin" size={18} /> : <Play size={18} />}
          <span>{isVideoAnalyzing ? "영상 분석 중" : "영상 분석"}</span>
        </button>
        <label className="provider-select">
          <Bot size={18} aria-hidden="true" />
          <select value={llmProvider} onChange={(event) => onProviderChange(event.target.value)} disabled={isBusy}>
            <option value="openai">GPT-4.1 mini</option>
            <option value="ollama">Qwen3.5 9B</option>
          </select>
          <ChevronDown size={16} aria-hidden="true" />
        </label>
        <button className="primary-action result-action" type="button" onClick={onResultAnalyze} disabled={!canAnalyzeResult || isBusy}>
          {isResultAnalyzing ? <Loader2 className="spin" size={18} /> : <Play size={18} />}
          <span>{isResultAnalyzing ? "결과분석 중" : "결과분석"}</span>
        </button>
      </div>

      <div className="setting-grid" aria-label="영상 분석 설정">
        <label className="field-control">
          <span>
            <Settings2 size={16} /> 작업물 무게
          </span>
          <input
            type="number"
            min="0"
            max="50"
            step="0.5"
            value={loadKg}
            onChange={(event) => onLoadKgChange(Number(event.target.value))}
            disabled={isBusy}
          />
        </label>
        <label className="field-control">
          <span>다리 지지 상태</span>
          <select value={legScore} onChange={(event) => onLegScoreChange(Number(event.target.value))} disabled={isBusy}>
            <option value={1}>안정적 지지</option>
            <option value={2}>불안정 / 한쪽 발 지지</option>
          </select>
        </label>
      </div>

      {preview && (
        <div className="preview-grid" aria-label="업로드 영상 요약">
          <Metric label="파일 형식" value={preview.type} />
          <Metric label="파일 크기" value={preview.size} />
          <Metric label="분석 샘플" value={videoSummary?.total_samples ?? "-"} />
          <Metric label="최종 점수" value={videoSummary?.final_score ?? "-"} />
        </div>
      )}

      {!preview && (
        <div className="empty-preview">
          <FileVideo size={18} />
          <span>대기 중</span>
        </div>
      )}

      {videoSummary && (
        <div className="analysis-ready">
          <strong>영상 분석 완료</strong>
          <span>
            최고 {videoSummary.frame_score_max ?? "-"}점 · 최대 위험 {videoSummary.peak_second ?? "-"}초
          </span>
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
