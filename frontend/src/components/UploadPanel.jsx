import { Bot, ChevronDown, Download, FileJson, Loader2, Play, Upload } from "lucide-react";
import { sampleUrl } from "../api/analyzeApi";

export function UploadPanel({ file, preview, llmProvider, isAnalyzing, onFileChange, onProviderChange, onAnalyze }) {
  return (
    <section className="upload-band">
      <div className="upload-copy">
        <p className="eyebrow">JSON 업로드</p>
        <h1>Barobon RULA 리포트</h1>
      </div>

      <div className="upload-controls">
        <label className="file-drop">
          <Upload size={20} aria-hidden="true" />
          <span>{file ? file.name : "JSON 파일 선택"}</span>
          <input type="file" accept="application/json,.json" onChange={onFileChange} />
        </label>
        <label className="provider-select">
          <Bot size={18} aria-hidden="true" />
          <select value={llmProvider} onChange={(event) => onProviderChange(event.target.value)} disabled={isAnalyzing}>
            <option value="openai">GPT-4.1 mini</option>
            <option value="ollama">Qwen3.5 9B</option>
          </select>
          <ChevronDown size={16} aria-hidden="true" />
        </label>
        <button className="primary-action" type="button" onClick={onAnalyze} disabled={!file || isAnalyzing}>
          {isAnalyzing ? <Loader2 className="spin" size={18} /> : <Play size={18} />}
          <span>{isAnalyzing ? "분석 중" : "분석 실행"}</span>
        </button>
        <a className="ghost-action" href={sampleUrl()} download>
          <Download size={18} />
          <span>샘플 JSON</span>
        </a>
      </div>

      {preview && (
        <div className="preview-grid" aria-label="업로드 파일 요약">
          <Metric label="최종 점수" value={preview.finalScore ?? "-"} />
          <Metric label="프레임 수" value={preview.totalFrames ?? "-"} />
          <Metric label="최고 프레임" value={preview.frameMax ?? "-"} />
          <Metric label="형식" value={preview.shape} />
        </div>
      )}

      {!preview && (
        <div className="empty-preview">
          <FileJson size={18} />
          <span>대기 중</span>
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
