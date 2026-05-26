import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Hash, Layers3, X } from "lucide-react";
import {
  formatBodyParts,
  formatDrivers,
  formatEvidenceId,
  formatSide,
  formatWindowTime,
  formatWindowTitle,
} from "../utils/riskDisplay";
import { getWorkerRiskLevel } from "../utils/workerRiskMetrics";

export function EvidencePanel({
  canMoveNext = false,
  canMovePrevious = false,
  expanded = false,
  frameCount = 0,
  frameIndex = -1,
  frames = [],
  imageFrames = [],
  onMoveNext,
  onMovePrevious,
  selectedFrame,
  selectedWindow,
}) {
  if (expanded) {
    return (
      <WorkerEvidencePanel
        canMoveNext={canMoveNext}
        canMovePrevious={canMovePrevious}
        frameCount={frameCount}
        frameIndex={frameIndex}
        onMoveNext={onMoveNext}
        onMovePrevious={onMovePrevious}
        selectedFrame={selectedFrame}
        selectedWindow={selectedWindow}
      />
    );
  }

  return (
    <UserEvidencePanel
      frames={frames}
      imageFrames={imageFrames}
      selectedWindow={selectedWindow}
    />
  );
}

function UserEvidencePanel({ frames, imageFrames, selectedWindow }) {
  const [previewFrame, setPreviewFrame] = useState(null);
  const closeButtonRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!previewFrame) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function handleEscape(event) {
      if (event.key === "Escape") closePreview();
    }

    document.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleEscape);
    };
  }, [previewFrame]);

  function openPreview(frame, target) {
    triggerRef.current = target;
    setPreviewFrame(frame);
  }

  function closePreview() {
    setPreviewFrame(null);
    triggerRef.current?.focus();
  }

  return (
    <>
      <section className="panel evidence-panel">
        <EvidenceHeader selectedWindow={selectedWindow} />

        {selectedWindow ? (
          <>
            <EvidenceMeta selectedWindow={selectedWindow} />

            {imageFrames.length > 0 ? (
              <div className="evidence-image-grid">
                {imageFrames.map((frame) => (
                  <figure key={`${frame.frame_id}-image`}>
                    <button
                      aria-label={`${frame.frame_id} 위험 자세 이미지 확대 보기`}
                      className="evidence-image-button"
                      onClick={(event) => openPreview(frame, event.currentTarget)}
                      type="button"
                    >
                      <img src={frame.imageDataUrl} alt={`${frame.frame_id} 위험 자세 이미지`} />
                    </button>
                    <figcaption>
                      {frame.frame_id} · {frame.time_sec}s · RULA {frame.frame_score}점 · {formatSide(frame.side)}
                    </figcaption>
                  </figure>
                ))}
              </div>
            ) : (
              <p className="muted evidence-image-empty">이 위험구간에 연결된 대표 이미지가 없습니다.</p>
            )}

            <div className="frame-grid">
              {frames.map((frame) => (
                <article className="frame-card" key={frame.frame_id}>
                  <div>
                    <strong>{frame.frame_id}</strong>
                    <span>{frame.time_sec}s · {formatSide(frame.side)}</span>
                  </div>
                  <dl>
                    <dt>RULA</dt>
                    <dd>{frame.frame_score}</dd>
                    <dt>몸통</dt>
                    <dd>{frame.angles.trunk_deg ?? "-"}°</dd>
                    <dt>손목</dt>
                    <dd>{frame.angles.wrist_deg ?? "-"}°</dd>
                    <dt>목</dt>
                    <dd>{frame.angles.neck_deg ?? "-"}°</dd>
                  </dl>
                  <p>{formatDrivers(frame.drivers)}</p>
                </article>
              ))}
            </div>
          </>
        ) : (
          <p className="muted">위험 구간을 선택하면 대표 프레임이 표시됩니다.</p>
        )}
      </section>

      {previewFrame && (
        <div className="evidence-lightbox" onClick={(event) => {
          if (event.target === event.currentTarget) closePreview();
        }}>
          <div
            aria-label="위험 자세 이미지 확대 보기"
            aria-modal="true"
            className="evidence-lightbox-content"
            role="dialog"
          >
            <button
              aria-label="확대 이미지 닫기"
              className="evidence-lightbox-close"
              onClick={closePreview}
              ref={closeButtonRef}
              type="button"
            >
              <X size={22} />
            </button>
            <img src={previewFrame.imageDataUrl} alt={`${previewFrame.frame_id} 위험 자세 이미지 확대`} />
            <p>
              {previewFrame.frame_id} · {previewFrame.time_sec}s · RULA {previewFrame.frame_score}점 · {formatSide(previewFrame.side)}
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function WorkerEvidencePanel({
  canMoveNext,
  canMovePrevious,
  frameCount,
  frameIndex,
  onMoveNext,
  onMovePrevious,
  selectedFrame,
  selectedWindow,
}) {
  const [failedFrameId, setFailedFrameId] = useState(null);
  const [previewFrame, setPreviewFrame] = useState(null);
  const closeButtonRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    setFailedFrameId(null);
  }, [selectedFrame?.frame_id, selectedFrame?.imageDataUrl]);

  useEffect(() => {
    if (!previewFrame) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function handleEscape(event) {
      if (event.key === "Escape") closePreview();
    }

    document.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleEscape);
    };
  }, [previewFrame]);

  function openPreview(frame, target) {
    triggerRef.current = target;
    setPreviewFrame(frame);
  }

  function closePreview() {
    setPreviewFrame(null);
    triggerRef.current?.focus();
  }

  function handleKeyDown(event) {
    if (event.key === "ArrowLeft" && canMovePrevious) {
      event.preventDefault();
      onMovePrevious();
    }
    if (event.key === "ArrowRight" && canMoveNext) {
      event.preventDefault();
      onMoveNext();
    }
  }

  if (!selectedWindow) {
    return (
      <section className="panel evidence-panel worker-evidence-panel">
        <EvidenceHeader selectedWindow={selectedWindow} />
        <p className="muted">타임라인에서 위험 구간을 선택하면 상세 근거가 표시됩니다.</p>
      </section>
    );
  }

  const showNavigation = canMovePrevious || canMoveNext;
  const hasImage = Boolean(
    selectedFrame?.imageDataUrl
    && failedFrameId !== selectedFrame.frame_id,
  );
  const riskLevel = getWorkerRiskLevel(selectedFrame?.frame_score);

  return (
    <>
      <section
        aria-label="선택된 위험 구간 상세 근거"
        className="panel evidence-panel worker-evidence-panel"
        onKeyDown={handleKeyDown}
        tabIndex={0}
      >
        <EvidenceHeader selectedWindow={selectedWindow} />

        {selectedFrame ? (
          <div className="worker-evidence-layout">
            <EvidenceMeta selectedWindow={selectedWindow} />
            <figure className="worker-frame-viewer">
              <div className="worker-frame-stage">
                {showNavigation && (
                  <button
                    aria-label="이전 위험 프레임 보기"
                    className="worker-frame-nav previous"
                    disabled={!canMovePrevious}
                    onClick={onMovePrevious}
                    type="button"
                  >
                    <ChevronLeft size={26} />
                  </button>
                )}

                {hasImage ? (
                  <button
                    aria-label={`${formatWindowTitle(selectedWindow.window_id)} 위험 자세 이미지 확대 보기`}
                    className="worker-frame-image-button"
                    onClick={(event) => openPreview(selectedFrame, event.currentTarget)}
                    type="button"
                  >
                    <img
                      alt={`${formatWindowTitle(selectedWindow.window_id)} 위험 자세 이미지`}
                      onError={() => setFailedFrameId(selectedFrame.frame_id)}
                      src={selectedFrame.imageDataUrl}
                    />
                  </button>
                ) : (
                  <div className="worker-frame-image-empty">
                    <strong>이미지를 불러올 수 없습니다.</strong>
                    <span>선택 시점: {selectedFrame.time_sec}s</span>
                  </div>
                )}

                {showNavigation && (
                  <button
                    aria-label="다음 위험 프레임 보기"
                    className="worker-frame-nav next"
                    disabled={!canMoveNext}
                    onClick={onMoveNext}
                    type="button"
                  >
                    <ChevronRight size={26} />
                  </button>
                )}
              </div>
              <figcaption className="worker-frame-caption">
                <span>
                  {selectedFrame.time_sec}s · RULA {selectedFrame.frame_score}점 · {formatSide(selectedFrame.side)}
                </span>
                <b>{frameIndex + 1} / {frameCount}</b>
              </figcaption>
            </figure>

            <article className="worker-frame-analysis">
              <header>
                <strong>{formatWindowTitle(selectedWindow.window_id)}</strong>
                <span>{selectedFrame.time_sec}s</span>
              </header>

              <dl className="worker-analysis-score">
                <dt>RULA 점수</dt>
                <dd>{selectedFrame.frame_score}점</dd>
                <dt>위험 수준</dt>
                <dd className={riskLevel.key}>{riskLevel.label}</dd>
              </dl>

              <div className="worker-analysis-side">
                <span>몸통 방향</span>
                <strong>{formatSide(selectedFrame.side)}</strong>
              </div>

              <section className="worker-analysis-section">
                <h4>주요 각도</h4>
                <dl className="worker-analysis-angles">
                  <dt>몸통</dt>
                  <dd>{formatAngle(selectedFrame.angles?.trunk_deg)}</dd>
                  <dt>손목</dt>
                  <dd>{formatAngle(selectedFrame.angles?.wrist_deg)}</dd>
                  <dt>목</dt>
                  <dd>{formatAngle(selectedFrame.angles?.neck_deg)}</dd>
                </dl>
              </section>

              <section className="worker-analysis-section">
                <h4>위험 부위</h4>
                <div className="worker-body-part-chips">
                  {(selectedWindow.dominant_body_parts || []).map((part) => (
                    <span key={part}>{formatBodyParts([part])}</span>
                  ))}
                </div>
              </section>

              <section className="worker-analysis-section">
                <h4>위험 요인</h4>
                <p>{formatDrivers(selectedFrame.drivers)}</p>
              </section>
            </article>
          </div>
        ) : (
          <p className="muted worker-frame-empty">선택한 위험 구간에 표시할 프레임 정보가 없습니다.</p>
        )}
      </section>

      {previewFrame && (
        <div className="evidence-lightbox" onClick={(event) => {
          if (event.target === event.currentTarget) closePreview();
        }}>
          <div
            aria-label="위험 자세 이미지 확대 보기"
            aria-modal="true"
            className="evidence-lightbox-content"
            role="dialog"
          >
            <button
              aria-label="확대 이미지 닫기"
              className="evidence-lightbox-close"
              onClick={closePreview}
              ref={closeButtonRef}
              type="button"
            >
              <X size={22} />
            </button>
            <img
              alt={`${formatWindowTitle(selectedWindow.window_id)} 위험 자세 이미지 확대`}
              src={previewFrame.imageDataUrl}
            />
            <p>
              {formatWindowTitle(selectedWindow.window_id)} · {previewFrame.time_sec}s · RULA {previewFrame.frame_score}점 · {formatSide(previewFrame.side)}
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function EvidenceHeader({ selectedWindow }) {
  return (
    <div className="panel-heading">
      <h3>근거 상세</h3>
      <span>{selectedWindow ? formatWindowTitle(selectedWindow.window_id) : "선택 없음"}</span>
    </div>
  );
}

function EvidenceMeta({ selectedWindow }) {
  return (
    <div className="evidence-meta">
      <span>
        <Hash size={14} /> 최고 점수 {selectedWindow.window_score_max}
      </span>
      <span>
        <Hash size={14} /> {formatEvidenceId(selectedWindow.window_id)}
      </span>
      <span>
        <Hash size={14} /> {formatWindowTime(selectedWindow.start_sec, selectedWindow.end_sec)}
      </span>
      <span>
        <Layers3 size={14} /> {formatBodyParts(selectedWindow.dominant_body_parts)}
      </span>
    </div>
  );
}

function formatAngle(value) {
  return Number.isFinite(Number(value)) ? `${Number(value)}°` : "-";
}
