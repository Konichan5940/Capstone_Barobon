const BODY_PART_LABELS = {
  trunk: "몸통",
  neck: "목",
  wrist: "손목",
  upper_arm: "상완",
  lower_arm: "전완",
  shoulder: "어깨",
  leg: "다리",
  unknown: "알 수 없음",
};

export function formatWindowTitle(windowId) {
  const match = String(windowId || "").match(/(\d+)$/);
  return match ? `위험 구간 ${Number(match[1])}` : "위험 구간";
}

export function formatEvidenceId(windowId) {
  return windowId ? `증거 ID ${windowId}` : "증거 ID 없음";
}

export function formatWindowTime(startSec, endSec) {
  return `${formatTime(startSec)} - ${formatTime(endSec)}`;
}

export function formatBodyParts(parts) {
  if (!Array.isArray(parts) || parts.length === 0) {
    return BODY_PART_LABELS.unknown;
  }

  const labels = parts
    .map((part) => {
      const key = String(part || "").trim();
      if (!key) return BODY_PART_LABELS.unknown;
      return BODY_PART_LABELS[key] || key;
    })
    .filter(Boolean);

  return labels.length ? labels.join(", ") : BODY_PART_LABELS.unknown;
}

function formatTime(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return "시간 미상";

  if (!Number.isInteger(seconds)) {
    return `${Number(seconds.toFixed(1))}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

