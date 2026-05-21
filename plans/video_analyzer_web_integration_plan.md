# 영상 분석기와 웹 결과분석 통합 계획서

작성일: 2026-05-21

## 1. 목표

현재 구조는 영상 분석기에서 `barobon_analysis_result.json`을 export하고, 웹 프로젝트에서 그 JSON을 다시 upload해 LLM 결과분석을 수행하는 방식이다.

이번 통합의 목표는 이 중간 파일 단계를 없애고 다음 흐름으로 합치는 것이다.

```text
영상 업로드
-> 영상 분석 클릭
-> 기존 영상 분석기 함수 실행
-> 분석 결과 dict를 웹용 payload로 변환
-> React 상태에 보관
-> 모델 선택
-> 결과분석 클릭
-> 현재 웹의 LLM/근거검증/결과화면 구조 그대로 사용
```

중요한 원칙은 `0521\Capstone_Design`의 분석기 폴더를 런타임에 import하지 않는 것이다. 필요한 분석기 코드는 `33_웹4` 백엔드 안에 복사/생성하고, 이후 웹 통합에 필요한 수정은 그 복사본에서만 진행한다.

## 2. 현재 구조 요약

### 2.1 웹 프로젝트

대상 폴더:

```text
C:\Users\leecs\Desktop\캡스톤디자인\33_웹4
```

현재 웹 흐름:

```text
frontend UploadPanel.jsx
-> frontend analyzeApi.js
-> POST /api/analyze
-> backend app.services.pipeline.run_analysis()
-> parse_json_upload()
-> validate_barobon_payload()
-> normalize_barobon_payload()
-> attach_risk_windows()
-> build_evidence_bundle()
-> generate_llm_report()
-> verify_llm_result()
-> 기존 결과 화면 렌더링
```

기존 결과 화면은 `result.canonical.frames`, `result.canonical.windows`, `result.llm_result`, `result.verification`을 기준으로 이미 동작한다.

### 2.2 기존 영상 분석기 원본

원본 위치:

```text
C:\Users\leecs\Desktop\캡스톤디자인\20_코드\0521\Capstone_Design
```

핵심 파일:

```text
app_sec.py        # Streamlit UI
analyzer_sec.py   # 실제 영상 분석 함수
rula_engine.py    # RULA 점수표 엔진
utils.py          # 각도, 반복, 정적 자세, 손목 twist 유틸
```

원본 Streamlit UI인 `app_sec.py`는 보존한다. 웹 프로젝트는 이 폴더를 직접 import하지 않고, 아래 핵심 분석 파일을 `33_웹4/backend/app/video_analyzer/` 안에 복사해서 사용한다.

```text
analyzer_sec.py
rula_engine.py
utils.py
```

웹 백엔드에서 호출할 함수는 복사본의 다음 함수다.

```python
analyze_video_per_second(video_path, load_kg=0, leg_score=1)
```

반환 구조:

```python
{
    "summary": {
        "score": int,
        "action": str,
        "total": int,
        "risk_details": {...}
    },
    "ts": {
        "sec": [...],
        "trunk": [...],
        "elbow": [...],
        "upper_arm": [...],
        "neck": [...],
        "wrist": [...],
        "twist": [...],
        "rula": [...],
        "flags": [...],
        "side": [...]
    },
    "worst": {
        "img": numpy.ndarray | None,
        "sec": float,
        "score": int
    }
}
```

이 구조는 이미 웹의 `time_series_data` 계약과 거의 맞기 때문에 JSON 파일로 저장할 필요 없이 바로 변환해서 사용할 수 있다.

## 3. 최종 사용자 흐름

웹 첫 화면의 작업 흐름을 다음처럼 바꾼다.

```text
1. 영상 파일 선택
   - mp4, mov, avi 허용

2. 분석 환경 설정
   - 작업물 무게 kg
   - 다리 지지 상태

3. 영상 분석 클릭
   - FastAPI가 임시 영상 파일을 만들고 백엔드 내부 복사본 analyzer_sec.py를 호출
   - 시계열 값, summary, peak image를 반환
   - 프론트는 이 결과를 React state에 저장
   - 이 단계에서는 아직 LLM 호출을 하지 않음

4. 모델 선택
   - GPT-4.1 mini
   - Qwen3.5 9B

5. 결과분석 클릭
   - 프론트가 저장해 둔 영상 분석 payload를 백엔드에 전송
   - 백엔드는 현재 JSON 분석 파이프라인과 같은 방식으로 LLM 결과 생성
   - 기존 결과 화면을 그대로 렌더링
```

## 4. 백엔드 설계

### 4.1 내부 분석기 패키지 생성

웹 백엔드 안에 분석기 전용 패키지를 새로 만든다.

```text
backend/app/video_analyzer/
├─ __init__.py
├─ analyzer_sec.py
├─ rula_engine.py
└─ utils.py
```

생성 방식:

```text
1. `20_코드\0521\Capstone_Design`의 `analyzer_sec.py`, `rula_engine.py`, `utils.py` 내용을 그대로 복사한다.
2. 복사본의 import만 패키지 내부 import에 맞게 최소 수정한다.
3. 이후 웹 연동에 필요한 변경은 이 복사본에서만 수행한다.
4. 원본 Streamlit 폴더는 수정하지 않는다.
```

복사 후 import 예시:

```python
from app.video_analyzer.analyzer_sec import analyze_video_per_second
```

이 방식은 외부 저장 위치에 의존하지 않기 때문에, `33_웹4` 프로젝트만 복사하거나 배포해도 분석 기능이 같이 따라간다.

### 4.2 새 설정값

`backend/app/config.py`에는 외부 분석기 경로가 아니라 영상 업로드 제한값만 추가한다.

```python
max_video_upload_bytes: int = _int_env("MAX_VIDEO_UPLOAD_BYTES", 300 * 1024 * 1024)
```

필요하면 허용 확장자도 상수로 둔다.

```python
allowed_video_extensions: tuple[str, ...] = (".mp4", ".mov", ".avi")
```

### 4.3 새 service: video_adapter.py

새 파일:

```text
backend/app/services/video_adapter.py
```

역할:

```text
1. 업로드 확장자 검증
2. 임시 영상 파일 저장
3. app.video_analyzer.analyzer_sec.analyze_video_per_second() 호출
4. NumPy/OpenCV 자료형을 JSON 직렬화 가능한 값으로 변환
5. worst image를 data URL로 변환
6. 분석기 반환값을 기존 Barobon JSON payload 형태로 감싸기
```

분석기 호출은 다음 형태가 된다.

```python
raw = analyze_video_per_second(
    temp_video_path,
    load_kg=load_kg,
    leg_score=leg_score,
)
```

웹용 payload 변환 결과는 다음 형태로 맞춘다.

```python
payload = {
    "metadata": {
        "worker_load_kg": load_kg,
        "leg_condition_score": leg_score,
        "source_video_name": original_filename,
    },
    "task_name": original_filename,
    "assessment_method": "RULA",
    "sampling_hz": estimated_sampling_hz,
    "summary": raw["summary"],
    "time_series_data": raw["ts"],
    "peak_risk_event": {
        "second": raw["worst"]["sec"],
        "score": raw["worst"]["score"],
    },
}
```

### 4.4 이미지 전달 방식

`raw["worst"]["img"]`는 NumPy RGB 이미지이므로 그대로 JSON 응답에 넣을 수 없다. adapter에서 PNG data URL로 변환한다.

```python
{
    "media": {
        "peak_image_data_url": "data:image/png;base64,..."
    }
}
```

이 방식을 쓰면 이미지 파일 저장소, 정적 파일 라우팅, 삭제 작업이 필요 없다. 최대 위험 순간 이미지 1장만 보여주는 현재 목적에는 이 방식이 가장 단순하다.

### 4.5 새 pipeline 함수

기존 `run_analysis(filename, content, provider)`는 JSON 파일 업로드용으로 유지한다.

추가 함수:

```python
def run_analysis_payload(
    payload: dict,
    filename: str = "video-analysis",
    provider: str = "openai",
    media: dict | None = None,
) -> dict:
    ...
```

내부 흐름은 기존과 거의 같다.

```text
validate_barobon_payload(payload)
-> normalize_barobon_payload(payload, warnings)
-> attach_risk_windows(canonical)
-> build_evidence_bundle(canonical)
-> generate_llm_report(evidence_bundle, provider)
-> verify_llm_result(llm_result, evidence_bundle)
-> 기존 result 형태 반환
-> media가 있으면 result["media"]로 포함
```

이렇게 하면 JSON 파일 업로드와 영상 분석 결과분석이 같은 파이프라인을 공유한다.

### 4.6 새 API

새 라우터 파일:

```text
backend/app/routes/video.py
```

API 1: 영상 분석

```http
POST /api/video/analyze
Content-Type: multipart/form-data
```

Form fields:

```text
file: mp4/mov/avi
load_kg: float
leg_score: int
```

응답:

```json
{
  "status": "ok",
  "video_summary": {
    "filename": "sample.mp4",
    "total_samples": 52,
    "final_score": 7,
    "peak_second": 12.5,
    "peak_score": 7
  },
  "payload": {
    "metadata": {},
    "summary": {},
    "time_series_data": {},
    "peak_risk_event": {}
  },
  "media": {
    "peak_image_data_url": "data:image/png;base64,..."
  }
}
```

API 2: 결과분석

```http
POST /api/analyze-payload
Content-Type: application/json
```

Request:

```json
{
  "provider": "openai",
  "filename": "sample.mp4",
  "payload": {},
  "media": {
    "peak_image_data_url": "data:image/png;base64,..."
  }
}
```

응답은 현재 `/api/analyze`와 같은 result 구조를 반환한다.

```json
{
  "status": "ok",
  "input_summary": {},
  "canonical": {},
  "evidence_bundle": {},
  "llm_result": {},
  "llm_meta": {},
  "verification": {},
  "media": {
    "peak_image_data_url": "data:image/png;base64,..."
  }
}
```

### 4.7 main.py 라우터 등록

`backend/app/main.py`에 새 라우터를 추가한다.

```python
from app.routes.video import router as video_router

app.include_router(video_router, prefix="/api")
```

## 5. 프론트엔드 설계

### 5.1 API 함수 추가

`frontend/src/api/analyzeApi.js`에 다음 함수를 추가한다.

```javascript
export async function analyzeVideo(file, { loadKg, legScore }) {
  const body = new FormData();
  body.append("file", file);
  body.append("load_kg", String(loadKg));
  body.append("leg_score", String(legScore));

  const response = await fetch(`${API_BASE}/api/video/analyze`, {
    method: "POST",
    body,
  });

  ...
}

export async function analyzePayload({ payload, provider, filename, media }) {
  const response = await fetch(`${API_BASE}/api/analyze-payload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload, provider, filename, media }),
  });

  ...
}
```

기존 `analyzeJson()`은 당장 삭제하지 않고 유지한다. 회귀 테스트와 샘플 JSON 분석용으로 남겨두는 편이 안전하다.

### 5.2 App 상태 변경

현재 주요 상태:

```javascript
const [file, setFile] = useState(null);
const [preview, setPreview] = useState(null);
const [result, setResult] = useState(null);
const [llmProvider, setLlmProvider] = useState("openai");
```

추가할 상태:

```javascript
const [videoPayload, setVideoPayload] = useState(null);
const [videoMedia, setVideoMedia] = useState(null);
const [videoSummary, setVideoSummary] = useState(null);
const [loadKg, setLoadKg] = useState(5.0);
const [legScore, setLegScore] = useState(1);
```

버튼별 동작:

```text
handleVideoAnalyze()
-> analyzeVideo(file, { loadKg, legScore })
-> setVideoPayload(response.payload)
-> setVideoMedia(response.media)
-> setVideoSummary(response.video_summary)

handleResultAnalyze()
-> analyzePayload({
     payload: videoPayload,
     provider: llmProvider,
     filename: file.name,
     media: videoMedia
   })
-> setResult(analysis)
-> 기존 결과 화면 표시
```

### 5.3 UploadPanel 변경

현재 `UploadPanel`은 JSON 선택과 분석 실행 버튼 중심이다.

변경 후:

```text
파일 선택: "영상 파일 선택"
accept: video/mp4,video/quicktime,video/x-msvideo,.mp4,.mov,.avi

설정:
- 작업물 무게 kg
- 다리 지지 상태

1차 버튼:
- "영상 분석"
- 영상 분석 중에는 disabled

모델 선택:
- GPT-4.1 mini
- Qwen3.5 9B

2차 버튼:
- "결과분석"
- videoPayload가 있을 때만 enabled
```

UI 문구 예시:

```text
영상 파일 선택
영상 분석
결과분석
```

프론트에서 사용자가 헷갈리지 않도록 JSON 다운로드/업로드 흐름은 기본 화면에서 제거한다. 필요하면 개발용 보조 버튼으로만 유지한다.

### 5.4 ProgressSteps 변경

기존 단계는 JSON 기준이다.

현재:

```text
JSON 검증 -> 정규화 -> 근거 생성 -> LLM 분석 -> 검증 완료
```

변경 제안:

```text
영상 업로드 -> 영상 분석 -> 시계열 변환 -> LLM 분석 -> 검증 완료
```

상태는 두 단계로 나눠 관리한다.

```text
phase = "idle"
phase = "video-analyzing"
phase = "video-ready"
phase = "llm-analyzing"
phase = "done"
```

### 5.5 최대 위험 순간 이미지 표시

새 컴포넌트:

```text
frontend/src/components/PeakRiskImage.jsx
```

props:

```javascript
export function PeakRiskImage({ imageDataUrl, peakEvent }) { ... }
```

렌더링 위치:

```text
ResultSummary 아래
RulaScoreChart 위 또는 옆
```

이미지는 `result.media.peak_image_data_url`에서 가져온다.

```jsx
{result?.media?.peak_image_data_url && (
  <PeakRiskImage
    imageDataUrl={result.media.peak_image_data_url}
    peakEvent={result.canonical.peak_risk_event}
  />
)}
```

## 6. 데이터 계약

### 6.1 영상 분석 결과를 웹 payload로 감싸는 규칙

분석기 반환값:

```python
raw["summary"] -> payload["summary"]
raw["ts"] -> payload["time_series_data"]
raw["worst"]["sec"] -> payload["peak_risk_event"]["second"]
raw["worst"]["score"] -> payload["peak_risk_event"]["score"]
raw["worst"]["img"] -> media["peak_image_data_url"]
```

### 6.2 기존 normalizer와 호환되는 필수값

반드시 있어야 하는 값:

```text
summary.score
summary.total
time_series_data.sec
time_series_data.rula
```

있으면 좋은 값:

```text
time_series_data.trunk
time_series_data.elbow
time_series_data.upper_arm
time_series_data.neck
time_series_data.wrist
time_series_data.twist
time_series_data.flags
time_series_data.side
metadata.worker_load_kg
metadata.leg_condition_score
peak_risk_event.second
peak_risk_event.score
```

`analyzer_sec.py`의 반환값은 이 값들을 이미 대부분 포함한다.

## 7. 의존성 변경

웹 백엔드 안에 복사한 분석기 코드를 직접 실행하려면 `backend/requirements.txt`에 영상 분석 의존성을 추가해야 한다.

추가 후보:

```text
opencv-python>=4.8.0
mediapipe>=0.10.9
numpy>=1.26.0
scipy>=1.11.0
```

주의: 복사할 `utils.py`는 `scipy.signal.find_peaks`를 사용한다. 새 환경에서 안정적으로 돌리려면 `scipy`를 웹 백엔드 requirements에 포함해야 한다.

## 8. 구현 순서

1. `backend/app/video_analyzer/`
   - 새 패키지 생성
   - `__init__.py` 생성
   - 원본 `analyzer_sec.py`, `rula_engine.py`, `utils.py` 내용을 복사
   - 복사본의 내부 import를 패키지 경로에 맞게 수정

2. `backend/app/config.py`
   - `MAX_VIDEO_UPLOAD_BYTES`
   - 허용 영상 확장자 설정 추가

3. `backend/app/services/video_adapter.py`
   - `app.video_analyzer.analyzer_sec`에서 분석 함수 import
   - 임시 파일 저장/삭제
   - `analyze_video_per_second()` 호출
   - NumPy 값 정리
   - peak image data URL 변환
   - Barobon payload 생성

4. `backend/app/services/pipeline.py`
   - `run_analysis_payload()` 추가
   - 기존 `run_analysis()`는 그대로 유지

5. `backend/app/routes/video.py`
   - `POST /api/video/analyze`
   - `POST /api/analyze-payload`

6. `backend/app/main.py`
   - video router 등록

7. `backend/requirements.txt`
   - 영상 분석기 의존성 추가

8. `frontend/src/api/analyzeApi.js`
   - `analyzeVideo()`
   - `analyzePayload()`

9. `frontend/src/App.jsx`
   - 영상 분석 상태 추가
   - `handleVideoAnalyze()`
   - `handleResultAnalyze()`
   - 기존 결과 화면 재사용

10. `frontend/src/components/UploadPanel.jsx`
    - JSON 업로드 UI에서 영상 업로드 UI로 변경
    - 작업물 무게/다리 지지 설정 추가
    - "영상 분석" 버튼과 "결과분석" 버튼 분리

11. `frontend/src/components/PeakRiskImage.jsx`
    - 최대 위험 순간 이미지 표시

12. `frontend/src/components/ProgressSteps.jsx`
    - 영상 분석 단계에 맞게 문구 변경

13. `frontend/src/styles.css`
    - 영상 분석 패널, 이미지 패널, 버튼 상태 스타일 추가

## 9. 테스트 계획

### 9.1 백엔드 단위 테스트

추가 테스트:

```text
backend/tests/test_video_adapter.py
```

검증 항목:

```text
- fake analyzer result를 Barobon payload로 변환할 수 있는지
- summary.score, summary.total, time_series_data.sec/rula가 유지되는지
- peak image가 있을 때 data URL이 생성되는지
- peak image가 None일 때도 API가 실패하지 않는지
- run_analysis_payload()가 기존 result 구조를 반환하는지
```

### 9.2 기존 테스트

```powershell
cd "C:\Users\leecs\Desktop\캡스톤디자인\33_웹4\backend"
..\.venv\Scripts\python.exe -m pytest
```

### 9.3 프론트 빌드

```powershell
cd "C:\Users\leecs\Desktop\캡스톤디자인\33_웹4\frontend"
npm run build
```

### 9.4 수동 통합 확인

1. 백엔드 실행

```powershell
cd "C:\Users\leecs\Desktop\캡스톤디자인\33_웹4\backend"
..\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

2. 프론트 실행

```powershell
cd "C:\Users\leecs\Desktop\캡스톤디자인\33_웹4\frontend"
npm run dev
```

3. 브라우저 확인

```text
http://127.0.0.1:5173
```

4. 확인 항목

```text
- 영상 업로드 가능
- 영상 분석 버튼 클릭 후 summary/시계열 payload 생성
- 최대 위험 순간 이미지 표시
- 모델 선택 가능
- 결과분석 버튼 클릭 후 기존 ResultSummary/RulaScoreChart/RiskWindowList/EvidencePanel 동작
- LLM fallback 상황에서도 결과 화면 깨지지 않음
```

## 10. 위험 요소와 대응

### 10.1 영상 분석 시간이 길 수 있음

초기 구현은 동기 API로 시작한다. 영상 길이가 길어져 요청 시간이 너무 길어지면 다음 단계에서 background job 구조로 분리한다.

초기 제한:

```text
- 업로드 최대 용량 제한
- 프론트에 영상 분석 중 상태 표시
- 백엔드 예외 메시지 명확화
```

### 10.2 복사본 코드와 원본 코드의 차이 관리

외부 경로 import를 쓰지 않기 때문에 경로 문제는 줄어든다. 대신 원본 분석기와 웹 백엔드 내부 복사본이 시간이 지나며 달라질 수 있다.

대응:

```text
- `backend/app/video_analyzer/README.md`에 원본 출처와 복사 일자를 기록
- 원본을 다시 반영할 때는 복사본에만 패치하고 기존 테스트를 실행
- 웹 통합용 수정은 원본 `20_코드\0521\Capstone_Design`이 아니라 복사본에서만 수행
```

### 10.3 NumPy/OpenCV 자료형 JSON 직렬화 문제

분석기 결과에는 NumPy 숫자, bool, 배열, 이미지가 섞일 수 있다.

대응:

```text
- video_adapter.py에서 int/float/bool/list로 정규화
- image는 data URL로 분리
- payload에는 순수 JSON 값만 넣기
```

### 10.4 이미지 응답 크기

최대 위험 이미지 1장만 data URL로 넣으면 단순하고 충분하다. 만약 응답 크기가 커지면 다음 방식으로 전환한다.

```text
- PNG -> JPEG quality 85
- 이미지 최대 폭 리사이즈
- data URL 대신 /api/media/{id} 이미지 URL 반환
```

### 10.5 기존 JSON 업로드 기능과 충돌

기존 `/api/analyze`와 `analyzeJson()`은 유지한다. 새 영상 플로우는 별도 API를 사용하므로 기존 JSON 샘플 분석은 계속 가능하다.

## 11. 완료 기준

통합 완료는 다음 조건을 모두 만족해야 한다.

```text
1. 사용자가 웹에서 영상 파일을 업로드할 수 있다.
2. "영상 분석" 버튼을 누르면 `backend/app/video_analyzer/analyzer_sec.py` 복사본이 실행된다.
3. JSON 파일을 저장하거나 다시 업로드하지 않아도 시계열 payload가 프론트 state에 유지된다.
4. "결과분석" 버튼을 누르면 현재 웹의 LLM 결과분석 파이프라인이 실행된다.
5. 기존 결과 화면 구조가 유지된다.
6. RULA 시계열 그래프가 표시된다.
7. 최대 위험 순간 이미지가 결과 화면에 표시된다.
8. OpenAI/Ollama 모델 선택이 유지된다.
9. 백엔드 테스트와 프론트 빌드가 통과한다.
```

## 12. 권장 최종 구조

```text
33_웹4/
├─ backend/
│  ├─ app/
│  │  ├─ video_analyzer/
│  │  │  ├─ __init__.py
│  │  │  ├─ analyzer_sec.py
│  │  │  ├─ rula_engine.py
│  │  │  ├─ utils.py
│  │  │  └─ README.md
│  │  ├─ routes/
│  │  │  ├─ analyze.py
│  │  │  └─ video.py
│  │  ├─ services/
│  │  │  ├─ pipeline.py
│  │  │  ├─ video_adapter.py
│  │  │  ├─ normalizer.py
│  │  │  ├─ evidence_builder.py
│  │  │  ├─ llm_client.py
│  │  │  └─ verifier.py
│  │  ├─ config.py
│  │  └─ main.py
│  └─ tests/
│     ├─ test_pipeline.py
│     └─ test_video_adapter.py
└─ frontend/
   └─ src/
      ├─ api/
      │  └─ analyzeApi.js
      ├─ components/
      │  ├─ UploadPanel.jsx
      │  ├─ PeakRiskImage.jsx
      │  ├─ ResultSummary.jsx
      │  ├─ RulaScoreChart.jsx
      │  ├─ RiskWindowList.jsx
      │  └─ EvidencePanel.jsx
      └─ App.jsx
```

이 구조로 구현하면 원본 Streamlit 분석기 폴더를 런타임에 import하지 않아도 된다. 웹 프로젝트는 `backend/app/video_analyzer/`에 포함된 분석기 복사본을 직접 실행하고, JSON export/upload 단계를 내부 API와 React state로 합친 형태가 된다.
