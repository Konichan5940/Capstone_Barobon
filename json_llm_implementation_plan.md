# JSON 업로드 기반 LLM 인간공학 리포트 구현 계획서

## 1. 구현 요약

이 프로젝트는 Barobon RULA 분석 결과 JSON 하나를 업로드하면, 백엔드가 수치 근거를 정규화하고 OpenAI Responses API 기반 LLM 리포트로 해석하는 작은 웹앱이다.

처리 흐름은 다음과 같다.

```text
JSON 업로드
→ 파일/스키마 검증
→ Barobon columnar JSON을 canonical frames[]로 변환
→ frame_score >= 6 기준으로 위험 구간 생성
→ evidence bundle 생성
→ OpenAI Responses API structured output 호출
→ evidence ID 및 unsupported claim 검증
→ React 결과 화면 표시
```

업로드 화면에서는 분석 실행 전에 `GPT-4.1 mini` 또는 `Qwen3.5 9B`를 선택할 수 있다. 선택값은 `/api/analyze`의 `provider` 필드로 전달된다.

OpenAI API 키가 없거나 선택한 모델 호출에 실패하면 백엔드는 명시적으로 `fallback` 상태의 규칙 기반 리포트를 반환한다. 이 fallback은 데모와 테스트를 위한 것이며, 실제 LLM 분석 결과와 구분되도록 `llm_meta.mode`에 표시된다.

## 2. 입력 JSON 및 스키마 수정안

업로드 기준 샘플은 `barobon_analysis_result (2).json` 형식이다.

필수 구조:

```json
{
  "summary": {
    "score": 7,
    "action": "즉각적인 개선 필요",
    "total": 52
  },
  "time_series_data": {
    "sec": [1, 2],
    "rula": [5, 6]
  }
}
```

권장 구조:

```json
{
  "metadata": {
    "worker_load_kg": 0.0,
    "leg_condition_score": 1
  },
  "summary": {
    "score": 7,
    "action": "즉각적인 개선 필요",
    "total": 52,
    "risk_details": {
      "wrist_twist": "발견 (+1 감점)",
      "trunk_twist": "발견 (+1 감점)",
      "repetition_or_static": "발견 (+1 감점)"
    }
  },
  "time_series_data": {
    "sec": [],
    "trunk": [],
    "elbow": [],
    "upper_arm": [],
    "neck": [],
    "wrist": [],
    "twist": [],
    "rula": [],
    "flags": [],
    "side": []
  },
  "peak_risk_event": {
    "second": 6,
    "score": 6
  }
}
```

구현에 반영한 수정안:

- `summary.score`는 `final_score`로 저장한다.
- `time_series_data.rula[]`는 각 프레임의 `frame_score`로 저장한다.
- `summary.score=7`이고 `max(rula)=6`인 경우를 정상으로 본다. 최종 점수와 프레임 점수를 다른 의미로 다루기 때문이다.
- `flags.arm_abd`, `wr_dev`, `nk_tw`, `tr_tw`는 각각 `arm_abduction`, `wrist_deviation`, `neck_twist`, `trunk_twist`로 변환한다.
- `side`는 `left`, `right`, `unknown`으로 정규화한다.
- 각 프레임에는 `F-000001` 형식의 `frame_id`를 부여한다.
- 위험 구간에는 `W-001` 형식의 `window_id`를 부여한다.
- 각도 단위는 원본에 없으므로 내부 metadata에 `angles_unit: "deg"`로 명시한다.
- 작업명, sampling_hz, pose confidence가 없으면 추측하지 않고 `limitations`에 기록한다.

## 3. 구현 파일 구조

```text
backend/
  app/
    main.py
    routes/analyze.py
    services/
      parser.py
      validator.py
      normalizer.py
      risk_window_builder.py
      evidence_builder.py
      llm_client.py
      verifier.py
      pipeline.py
    samples/barobon_analysis_result_2.json
  tests/test_pipeline.py
  requirements.txt

frontend/
  src/
    App.jsx
    api/analyzeApi.js
    components/
      UploadPanel.jsx
      ProgressSteps.jsx
      ResultSummary.jsx
      RiskWindowList.jsx
      EvidencePanel.jsx
      FindingsPanel.jsx
      LimitationsBox.jsx
    styles.css
  package.json
```

## 4. API 설계

| API | Method | 역할 |
|---|---|---|
| `/api/health` | GET | 서버 상태, LLM 설정 여부, 모델명 확인 |
| `/api/sample` | GET | 샘플 Barobon JSON 다운로드 |
| `/api/analyze` | POST | JSON 업로드 후 전체 분석 실행 |

`/api/analyze`는 `multipart/form-data`의 `file` 필드와 선택형 `provider` 필드를 받는다. `provider`는 `openai` 또는 `ollama`이며 생략 시 `openai`로 처리한다.

응답의 핵심 필드:

```json
{
  "status": "ok",
  "input_summary": {},
  "canonical": {},
  "evidence_bundle": {},
  "llm_result": {},
  "llm_meta": {},
  "verification": {}
}
```

## 5. 테스트 기준

구현 테스트는 다음 항목을 확인한다.

- 샘플 JSON이 52개 canonical frame으로 변환된다.
- `summary.score=7`과 `frame_score_max=6`이 분리된다.
- `flags.tr_tw=true`가 `trunk_twist=true`로 변환된다.
- `Left`, `Right` side가 `left`, `right`로 정규화된다.
- 배열 길이가 맞지 않으면 400 오류로 거부된다.
- 존재하지 않는 evidence ID는 verifier가 invalid 처리한다.

## 6. 실행 방법

백엔드:

```powershell
cd C:\Users\leecs\Desktop\캡스톤디자인\31_웹2
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
cd backend
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

프런트엔드:

```powershell
cd C:\Users\leecs\Desktop\캡스톤디자인\31_웹2\frontend
npm install
npm run dev
```

OpenAI를 실제로 호출하려면 `backend\.env.example`을 참고해 환경변수 `OPENAI_API_KEY`와 `OPENAI_MODEL`을 설정한다.
