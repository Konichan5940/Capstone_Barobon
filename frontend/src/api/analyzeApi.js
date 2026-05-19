const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

export async function analyzeJson(file, provider) {
  const body = new FormData();
  body.append("file", file);
  body.append("provider", provider);

  const response = await fetch(`${API_BASE}/api/analyze`, {
    method: "POST",
    body,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.detail?.message || "분석 요청에 실패했습니다.";
    const details = payload?.detail?.details || [];
    throw new Error([message, ...details].join("\n"));
  }
  return payload;
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
