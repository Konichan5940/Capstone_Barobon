const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

export async function analyzeJson(file, provider) {
  const body = new FormData();
  body.append("file", file);
  body.append("provider", provider);

  const response = await fetch(`${API_BASE}/api/analyze`, {
    method: "POST",
    body,
  });

  return readJsonResponse(response);
}

export async function analyzeVideo(file, { loadKg, legScore }) {
  const body = new FormData();
  body.append("file", file);
  body.append("load_kg", String(loadKg));
  body.append("leg_score", String(legScore));

  const response = await fetch(`${API_BASE}/api/video/analyze`, {
    method: "POST",
    body,
  });

  return readJsonResponse(response);
}

export async function analyzePayload({ payload, provider, filename, media }) {
  const response = await fetch(`${API_BASE}/api/analyze-payload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload, provider, filename, media }),
  });

  return readJsonResponse(response);
}

export function sampleUrl() {
  return `${API_BASE}/api/sample`;
}

export async function healthCheck() {
  const response = await fetch(`${API_BASE}/api/health`);
  if (!response.ok) {
    throw new Error("backend unavailable");
  }
  return response.json();
}

async function readJsonResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.detail?.message || "분석 요청에 실패했습니다.";
    const details = payload?.detail?.details || [];
    throw new Error([message, ...details].join("\n"));
  }
  return payload;
}
