import { Activity } from "lucide-react";
import {
  buildSelectableTimelineSegments,
  getWorkerRiskLevel,
} from "../utils/workerRiskMetrics";

const LEGEND_LEVELS = [
  { key: "safe", label: "안전" },
  { key: "caution", label: "주의" },
  { key: "danger", label: "위험" },
  { key: "urgent", label: "즉시개선" },
];

export function WorkerRiskTimeline({
  frames = [],
  windows = [],
  samplingHz,
  selectedWindowId,
  onSelectWindow,
}) {
  const segments = buildSelectableTimelineSegments(frames, windows, samplingHz);
  if (!segments.length) {
    return (
      <section className="panel worker-timeline">
        <div className="panel-heading">
          <h3><Activity size={18} /> 위험도 타임라인</h3>
          <span>데이터 없음</span>
        </div>
        <p className="muted">표시할 시간별 위험 데이터가 없습니다.</p>
      </section>
    );
  }

  const startSec = segments[0].startSec;
  const endSec = segments[segments.length - 1].endSec;
  const totalDuration = Math.max(endSec - startSec, 0.01);
  const ticks = createTicks(startSec, endSec, 5);
  const markers = createWindowMarkers(segments, windows, startSec, totalDuration);
  const hasStackedMarkers = markers.some((marker) => marker.row === 1);

  return (
    <section className="panel worker-timeline">
      <div className="panel-heading">
        <h3><Activity size={18} /> 위험도 타임라인</h3>
        <span>{formatTime(startSec)} - {formatTime(endSec)}</span>
      </div>
      <div className="worker-timeline-track" aria-label="시간별 위험 수준">
        {segments.map((segment) => (
          <TimelineSegment
            key={segment.segmentId}
            onSelectWindow={onSelectWindow}
            segment={segment}
            selected={selectedWindowId === segment.windowId}
            style={{
              width: `${((segment.endSec - segment.startSec) / totalDuration) * 100}%`,
            }}
          />
        ))}
      </div>
      <div className={`worker-timeline-markers ${hasStackedMarkers ? "stacked" : ""}`}>
        {markers.map((marker) => (
          <button
            aria-label={`위험 구간 ${marker.number} 상세 보기`}
            aria-pressed={selectedWindowId === marker.windowId}
            className={`worker-timeline-marker ${marker.level} ${selectedWindowId === marker.windowId ? "selected" : ""} row-${marker.row}`}
            key={marker.windowId}
            onClick={() => onSelectWindow?.(marker.windowId)}
            style={{ left: `clamp(16px, ${marker.centerPercent}%, calc(100% - 16px))` }}
            title={`위험 구간 ${marker.number} 보기`}
            type="button"
          >
            {marker.number}
          </button>
        ))}
      </div>
      <div className="worker-timeline-ticks" aria-hidden="true">
        {ticks.map((tick) => (
          <span key={tick} style={{ left: `${((tick - startSec) / totalDuration) * 100}%` }}>
            {formatTime(tick)}
          </span>
        ))}
      </div>
      <div className="worker-timeline-legend">
        {LEGEND_LEVELS.map((level) => (
          <span key={level.key}>
            <i className={`worker-legend-dot ${level.key}`} />
            {level.label}
          </span>
        ))}
      </div>
    </section>
  );
}

function TimelineSegment({ onSelectWindow, segment, selected, style }) {
  const label = `${formatTime(segment.startSec)} - ${formatTime(segment.endSec)} ${segment.label}, RULA ${segment.minScore}-${segment.maxScore}`;
  const interactive = Boolean(segment.windowId && typeof onSelectWindow === "function");

  if (interactive) return (
    <button
      aria-label={`${label}, 위험 구간 ${segment.windowId} 상세 보기`}
      aria-pressed={selected}
      className={`worker-timeline-segment interactive ${segment.level} ${selected ? "selected" : ""}`}
      data-window-id={segment.windowId}
      onClick={() => onSelectWindow(segment.windowId)}
      style={style}
      title={`${label} - 위험 구간 ${segment.windowId} 보기`}
      type="button"
    />
  );

  return <span aria-label={label} className={`worker-timeline-segment ${segment.level}`} style={style} title={label} />;
}

function createWindowMarkers(segments, windows, startSec, totalDuration) {
  const windowById = new Map(windows.map((window) => [window.window_id, window]));
  const markerById = new Map();

  segments.forEach((segment) => {
    if (!segment.windowId) return;
    const marker = markerById.get(segment.windowId);
    if (marker) {
      marker.startSec = Math.min(marker.startSec, segment.startSec);
      marker.endSec = Math.max(marker.endSec, segment.endSec);
      return;
    }

    const window = windowById.get(segment.windowId);
    markerById.set(segment.windowId, {
      endSec: segment.endSec,
      level: getWorkerRiskLevel(window?.window_score_max ?? segment.maxScore).key,
      startSec: segment.startSec,
      windowId: segment.windowId,
    });
  });

  const lastCenterByRow = [-Infinity, -Infinity];
  return [...markerById.values()]
    .sort((left, right) => left.startSec - right.startSec)
    .map((marker, index) => {
      const centerPercent = Number(
        ((((marker.startSec + marker.endSec) / 2 - startSec) / totalDuration) * 100).toFixed(3),
      );
      let row = lastCenterByRow.findIndex((lastCenter) => centerPercent - lastCenter >= 4.5);
      if (row === -1) {
        row = lastCenterByRow[0] <= lastCenterByRow[1] ? 0 : 1;
      }
      lastCenterByRow[row] = centerPercent;

      return {
        ...marker,
        centerPercent,
        number: getWindowNumber(marker.windowId, index),
        row,
      };
    });
}

function getWindowNumber(windowId, index) {
  const match = String(windowId || "").match(/(\d+)$/);
  return match ? Number(match[1]) : index + 1;
}

function createTicks(start, end, count) {
  if (start === end || count < 2) return [start];
  const step = (end - start) / (count - 1);
  return Array.from({ length: count }, (_, index) => Number((start + step * index).toFixed(1)));
}

function formatTime(seconds) {
  const numericSeconds = Number(seconds);
  if (!Number.isFinite(numericSeconds)) return "-";
  return `${Number(numericSeconds.toFixed(1))}s`;
}
