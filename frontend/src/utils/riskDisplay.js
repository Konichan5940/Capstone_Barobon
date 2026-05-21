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

const DRIVER_LABELS = {
  trunk_flexion: "몸통 굴곡",
  trunk_twist: "몸통 비틀림",
  neck_flexion: "목 굴곡",
  neck_twist: "목 비틀림",
  wrist_angle: "손목 부담",
  wrist_deviation: "손목 편위",
  wrist_twist: "손목 비틀림",
  upper_arm_elevation: "상완 거상",
  arm_abduction: "상완 벌림",
  repetition_or_static: "반복/정적 자세",
  heavy_load: "과도한 하중",
};

const FIELD_LABELS = {
  trunk_deg: "몸통 각도",
  elbow_deg: "팔꿈치 각도",
  upper_arm_deg: "상완 각도",
  neck_deg: "목 각도",
  wrist_deg: "손목 각도",
  twist_score: "손목 비틀림 점수",
  arm_abd: "상완 벌림",
  wr_dev: "손목 편위",
  nk_tw: "목 비틀림",
  tr_tw: "몸통 비틀림",
};

const SIDE_LABELS = {
  left: "왼쪽",
  right: "오른쪽",
  unknown: "알 수 없음",
};

const TEXT_LABELS = {
  ...DRIVER_LABELS,
  ...FIELD_LABELS,
  ...BODY_PART_LABELS,
  left: SIDE_LABELS.left,
  right: SIDE_LABELS.right,
  Left: SIDE_LABELS.left,
  Right: SIDE_LABELS.right,
  Unknown: SIDE_LABELS.unknown,
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
  return formatLabelList(parts, BODY_PART_LABELS);
}

export function formatDrivers(drivers) {
  return formatLabelList(drivers, DRIVER_LABELS, "위험 요인 없음");
}

export function formatSide(side) {
  const key = String(side || "").trim().toLowerCase();
  return SIDE_LABELS[key] || SIDE_LABELS.unknown;
}

export function localizeRiskText(value) {
  if (value === null || value === undefined) return "";

  const labels = Object.entries(TEXT_LABELS).sort((a, b) => b[0].length - a[0].length);
  return labels.reduce((text, [token, label]) => {
    const pattern = new RegExp(`(^|[^A-Za-z0-9_])(${escapeRegExp(token)})(?=$|[^A-Za-z0-9_])`, "g");
    return text.replace(pattern, (_, prefix) => `${prefix}${label}`);
  }, String(value));
}

function formatLabelList(values, labels, emptyLabel = BODY_PART_LABELS.unknown) {
  if (typeof values === "string") {
    return localizeRiskText(values) || emptyLabel;
  }

  if (!Array.isArray(values) || values.length === 0) {
    return emptyLabel;
  }

  const translated = values
    .map((value) => {
      const key = String(value || "").trim();
      if (!key) return emptyLabel;
      return labels[key] || localizeRiskText(key);
    })
    .filter(Boolean);

  return translated.length ? translated.join(", ") : emptyLabel;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
