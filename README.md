# Barobon JSON LLM Ergonomics Report

FastAPI + React/Vite 기반의 JSON 업로드형 RULA 리포트 웹앱입니다.

## Run

Backend:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
cd backend
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Frontend:

```powershell
cd frontend
npm install
npm run dev
```

Open the app at `http://127.0.0.1:5173`.

## API

- `GET /api/health`
- `GET /api/sample`
- `POST /api/analyze` with one `file` field containing a `.json` file

## LLM

The upload screen lets the user choose `GPT-4.1 mini` or `Qwen3.5 9B` before analysis.

For GPT, set:

```powershell
$env:OPENAI_API_KEY="..."
$env:OPENAI_MODEL="gpt-4.1-mini"
```

For Ollama, keep Ollama running locally and set:

```powershell
$env:OLLAMA_BASE_URL="http://127.0.0.1:11434"
$env:OLLAMA_MODEL="qwen3.5:9b"
$env:OLLAMA_TIMEOUT_SEC="240"
$env:OLLAMA_NUM_PREDICT="2048"
```

When the selected model is unavailable or the call fails, the API returns a clearly marked `fallback` report so the pipeline and UI remain testable.
