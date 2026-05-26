const UNKNOWN_LEVEL = {
  key: "unknown",
  label: "확인 필요",
};

export function getWorkerRiskLevel(score) {
  const numericScore = Number(score);
  if (!Number.isFinite(numericScore)) return UNKNOWN_LEVEL;
  if (numericScore >= 7) return { key: "urgent", label: "즉시개선" };
  if (numericScore >= 5) return { key: "danger", label: "위험" };
  if (numericScore >= 3) return { key: "caution", label: "주의" };
  return { key: "safe", label: "안전" };
}

export function calculateHighRiskAccumulatedSeconds(windows = [], frames = [], samplingHz) {
  if (!windows.length) return 0;

  const sampleDuration = estimateSampleDuration(frames, samplingHz);
  if (sampleDuration !== null) {
    const includedIds = new Set(windows.flatMap((window) => window.frame_ids || []));
    return roundSeconds(includedIds.size * sampleDuration);
  }

  return roundSeconds(
    windows.reduce((total, window) => total + (Number(window.duration_sec) || 0), 0),
  );
}

export function buildRiskTimelineSegments(frames = [], windows = [], samplingHz) {
  const orderedFrames = normalizeFrames(frames);
  if (!orderedFrames.length) return [];

  const sampleDuration = estimateSampleDuration(orderedFrames, samplingHz) || 1;
  const segments = [];

  orderedFrames.forEach((frame) => {
    const level = getWorkerRiskLevel(frame.frame_score);
    const endSec = frame.time_sec + sampleDuration;
    const previous = segments[segments.length - 1];
    const isContinuous = previous && frame.time_sec - previous.endSec <= sampleDuration * 0.5;

    if (previous && previous.level === level.key && isContinuous) {
      const previousMaxScore = previous.maxScore;
      previous.endSec = endSec;
      previous.minScore = Math.min(previous.minScore, frame.frame_score);
      previous.maxScore = Math.max(previous.maxScore, frame.frame_score);
      previous.frameIds.push(frame.frame_id);
      if (frame.frame_score > previousMaxScore) {
        previous.peakFrameIds = [frame.frame_id];
      } else if (frame.frame_score === previousMaxScore) {
        previous.peakFrameIds.push(frame.frame_id);
      }
      return;
    }

    segments.push({
      segmentId: `SEG-${String(segments.length + 1).padStart(3, "0")}`,
      level: level.key,
      label: level.label,
      startSec: frame.time_sec,
      endSec,
      minScore: frame.frame_score,
      maxScore: frame.frame_score,
      frameIds: [frame.frame_id],
      peakFrameIds: [frame.frame_id],
      relatedWindowIds: [],
    });
  });

  return segments.map((segment) => ({
    ...segment,
    endSec: roundSeconds(segment.endSec),
    relatedWindowIds: findRelatedWindowIds(segment.frameIds, windows),
  }));
}

export function buildSelectableTimelineSegments(frames = [], windows = [], samplingHz) {
  const orderedFrames = normalizeFrames(frames);
  if (!orderedFrames.length) return [];

  const sampleDuration = estimateSampleDuration(orderedFrames, samplingHz) || 1;
  const windowByFrameId = new Map(
    windows.flatMap((window) => (
      (window.frame_ids || []).map((frameId) => [frameId, window.window_id])
    )),
  );
  const segments = [];

  orderedFrames.forEach((frame) => {
    const level = getWorkerRiskLevel(frame.frame_score);
    const windowId = windowByFrameId.get(frame.frame_id) || null;
    const endSec = frame.time_sec + sampleDuration;
    const previous = segments[segments.length - 1];
    const isContinuous = previous && frame.time_sec - previous.endSec <= sampleDuration * 0.5;

    if (
      previous
      && previous.level === level.key
      && previous.windowId === windowId
      && isContinuous
    ) {
      previous.endSec = endSec;
      previous.minScore = Math.min(previous.minScore, frame.frame_score);
      previous.maxScore = Math.max(previous.maxScore, frame.frame_score);
      return;
    }

    segments.push({
      segmentId: `TL-${String(segments.length + 1).padStart(3, "0")}`,
      level: level.key,
      label: level.label,
      startSec: frame.time_sec,
      endSec,
      minScore: frame.frame_score,
      maxScore: frame.frame_score,
      windowId,
    });
  });

  return segments.map((segment) => ({
    ...segment,
    endSec: roundSeconds(segment.endSec),
  }));
}

export function findRelatedWindowIds(segmentFrameIds = [], windows = []) {
  const segmentIds = new Set(segmentFrameIds);
  return windows
    .filter((window) => (window.frame_ids || []).some((frameId) => segmentIds.has(frameId)))
    .map((window) => window.window_id);
}

export function pickTargetWindowId(segment, windows = []) {
  const candidates = windows.filter((window) => segment.relatedWindowIds.includes(window.window_id));
  if (!candidates.length) return null;

  const segmentIds = new Set(segment.frameIds);
  const peakIds = new Set(segment.peakFrameIds);
  return candidates
    .map((window) => {
      const frameIds = window.frame_ids || [];
      return {
        containsPeak: frameIds.some((frameId) => peakIds.has(frameId)),
        overlapCount: frameIds.filter((frameId) => segmentIds.has(frameId)).length,
        startSec: Number(window.start_sec) || 0,
        windowId: window.window_id,
      };
    })
    .sort((left, right) => (
      Number(right.containsPeak) - Number(left.containsPeak)
      || right.overlapCount - left.overlapCount
      || left.startSec - right.startSec
    ))[0].windowId;
}

export function estimateSampleDuration(frames = [], samplingHz) {
  const times = frames
    .map((frame) => Number(frame.time_sec))
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  const deltas = times
    .slice(1)
    .map((value, index) => value - times[index])
    .filter((value) => value > 0)
    .sort((left, right) => left - right);

  if (deltas.length) {
    const middle = Math.floor(deltas.length / 2);
    const median = deltas.length % 2
      ? deltas[middle]
      : (deltas[middle - 1] + deltas[middle]) / 2;
    return roundSeconds(median);
  }

  const numericSamplingHz = Number(samplingHz);
  if (Number.isFinite(numericSamplingHz) && numericSamplingHz > 0) {
    return roundSeconds(1 / numericSamplingHz);
  }

  return null;
}

export function formatAccumulatedDuration(seconds) {
  const numericSeconds = Number(seconds);
  return Number.isFinite(numericSeconds) ? `${numericSeconds.toFixed(1)}초` : "-";
}

function normalizeFrames(frames) {
  return frames
    .map((frame) => ({
      frame_id: frame.frame_id,
      frame_score: Number(frame.frame_score),
      time_sec: Number(frame.time_sec),
    }))
    .filter((frame) => (
      frame.frame_id
      && Number.isFinite(frame.frame_score)
      && Number.isFinite(frame.time_sec)
    ))
    .sort((left, right) => left.time_sec - right.time_sec);
}

function roundSeconds(seconds) {
  return Number(Number(seconds).toFixed(2));
}
