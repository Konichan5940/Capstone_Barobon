import { LineChart } from "lucide-react";
import { formatWindowTime } from "../utils/riskDisplay";

const CHART_WIDTH = 720;
const CHART_HEIGHT = 280;
const MARGIN = {
  top: 22,
  right: 28,
  bottom: 54,
  left: 54,
};

export function RulaScoreChart({ frames = [], windows = [] }) {
  const points = normalizeFrames(frames);

  if (points.length === 0) {
    return (
      <section className="panel score-chart-panel">
        <div className="panel-heading">
          <h3>RULA 점수 추이</h3>
          <span>데이터 없음</span>
        </div>
        <p className="muted">표시할 프레임 점수 데이터가 없습니다.</p>
      </section>
    );
  }

  const xMin = points[0].time;
  const xMax = points.length > 1 ? points[points.length - 1].time : points[0].time + 1;
  const yMin = 0;
  const yMax = Math.max(7, Math.ceil(Math.max(...points.map((point) => point.score))));
  const xScale = createScale(xMin, xMax, MARGIN.left, CHART_WIDTH - MARGIN.right);
  const yScale = createScale(yMin, yMax, CHART_HEIGHT - MARGIN.bottom, MARGIN.top);
  const xTicks = createTicks(xMin, xMax, 5);
  const yTicks = Array.from({ length: yMax - yMin + 1 }, (_, index) => yMin + index);
  const linePoints = points.map((point) => `${xScale(point.time)},${yScale(point.score)}`).join(" ");
  const riskThreshold = deriveRiskThreshold(points, windows);
  const peak = points.reduce((max, point) => (point.score > max.score ? point : max), points[0]);
  const highRiskWindows = windows.filter((window) => Number.isFinite(Number(window.start_sec)));

  return (
    <section className="panel score-chart-panel">
      <div className="panel-heading">
        <h3>
          <LineChart size={18} /> RULA 점수 추이
        </h3>
        <span>x축 시간 · y축 RULA 점수</span>
      </div>

      <div className="score-chart-wrap">
        <svg
          aria-label="시간에 따른 RULA 점수 그래프"
          className="score-chart"
          role="img"
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        >
          <g className="chart-risk-windows">
            {highRiskWindows.map((window) => {
              const start = clamp(Number(window.start_sec), xMin, xMax);
              const end = clamp(Number(window.end_sec ?? window.start_sec), xMin, xMax);
              const x = xScale(start);
              const width = Math.max(xScale(end) - x, 3);
              return (
                <rect
                  aria-label={`${formatWindowTime(window.start_sec, window.end_sec)} 고위험 구간`}
                  height={CHART_HEIGHT - MARGIN.top - MARGIN.bottom}
                  key={window.window_id || `${window.start_sec}-${window.end_sec}`}
                  width={width}
                  x={x}
                  y={MARGIN.top}
                />
              );
            })}
          </g>

          <g className="chart-grid">
            {yTicks.map((tick) => (
              <line
                key={`grid-y-${tick}`}
                x1={MARGIN.left}
                x2={CHART_WIDTH - MARGIN.right}
                y1={yScale(tick)}
                y2={yScale(tick)}
              />
            ))}
          </g>

          {riskThreshold !== null && riskThreshold <= yMax && (
            <g className="chart-threshold">
              <line
                x1={MARGIN.left}
                x2={CHART_WIDTH - MARGIN.right}
                y1={yScale(riskThreshold)}
                y2={yScale(riskThreshold)}
              />
              <text x={CHART_WIDTH - MARGIN.right} y={yScale(riskThreshold) - 6}>
                고위험 기준 {riskThreshold}
              </text>
            </g>
          )}

          <polyline className="chart-line" points={linePoints} />
          <circle className="chart-peak" cx={xScale(peak.time)} cy={yScale(peak.score)} r="4.5" />

          <g className="chart-axis chart-axis-y">
            <line x1={MARGIN.left} x2={MARGIN.left} y1={MARGIN.top} y2={CHART_HEIGHT - MARGIN.bottom} />
            {yTicks.map((tick) => (
              <text key={`y-${tick}`} x={MARGIN.left - 10} y={yScale(tick) + 4}>
                {tick}
              </text>
            ))}
            <text className="chart-axis-title" transform="rotate(-90)" x={-(CHART_HEIGHT / 2)} y="16">
              RULA 점수
            </text>
          </g>

          <g className="chart-axis chart-axis-x">
            <line
              x1={MARGIN.left}
              x2={CHART_WIDTH - MARGIN.right}
              y1={CHART_HEIGHT - MARGIN.bottom}
              y2={CHART_HEIGHT - MARGIN.bottom}
            />
            {xTicks.map((tick) => (
              <g key={`x-${tick}`}>
                <line
                  x1={xScale(tick)}
                  x2={xScale(tick)}
                  y1={CHART_HEIGHT - MARGIN.bottom}
                  y2={CHART_HEIGHT - MARGIN.bottom + 6}
                />
                <text x={xScale(tick)} y={CHART_HEIGHT - MARGIN.bottom + 24}>
                  {formatAxisTime(tick)}
                </text>
              </g>
            ))}
            <text className="chart-axis-title" x={CHART_WIDTH / 2} y={CHART_HEIGHT - 8}>
              시간
            </text>
          </g>
        </svg>
      </div>

      <div className="chart-legend">
        <span>
          <i className="legend-line" /> RULA 점수
        </span>
        <span>
          <i className="legend-window" /> 고위험 구간
        </span>
        <span>
          최고 {peak.score}점 · {formatAxisTime(peak.time)}
        </span>
      </div>
    </section>
  );
}

function normalizeFrames(frames) {
  return frames
    .map((frame) => ({
      score: Number(frame.frame_score),
      time: Number(frame.time_sec),
    }))
    .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.score))
    .sort((a, b) => a.time - b.time);
}

function createScale(domainMin, domainMax, rangeMin, rangeMax) {
  const domainSize = domainMax - domainMin || 1;
  return (value) => rangeMin + ((value - domainMin) / domainSize) * (rangeMax - rangeMin);
}

function createTicks(min, max, count) {
  if (count <= 1 || min === max) return [min];

  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, index) => roundTick(min + step * index));
}

function roundTick(value) {
  return Number(value.toFixed(Math.abs(value) < 10 ? 1 : 0));
}

function deriveRiskThreshold(points, windows) {
  const scores = windows.flatMap((window) => {
    const start = Number(window.start_sec);
    const end = Number(window.end_sec ?? window.start_sec);
    return points
      .filter((point) => point.time >= start && point.time <= end)
      .map((point) => point.score)
      .filter((score) => Number.isFinite(score));
  });

  if (scores.length === 0) return 6;
  return Math.min(...scores);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatAxisTime(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return "-";
  if (!Number.isInteger(seconds)) return `${Number(seconds.toFixed(1))}s`;
  return `${seconds}s`;
}
