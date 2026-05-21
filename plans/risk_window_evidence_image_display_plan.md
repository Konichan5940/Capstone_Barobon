# 위험구간 선택 기반 근거 상세 이미지 표시 계획

## 목표

현재 결과 화면은 `media.peak_image_data_url`을 사용해 `최대 위험 순간` 이미지를 결과 요약 아래에 한 장만 표시한다. 이 방식을 제거하고, 왼쪽 `위험 구간` 카드 선택에 따라 오른쪽 `근거 상세` 영역에서 해당 위험구간의 대표 프레임 이미지를 보여주도록 변경한다.

최종 UX 흐름은 다음과 같다.

1. 영상을 업로드한다.
2. `영상 분석`을 누르면 영상 분석기가 시계열 값과 위험 프레임 이미지를 함께 만든다.
3. `결과분석`을 누르면 기존처럼 결과 화면이 열린다.
4. 사용자가 `위험 구간` 카드(`W-001`, `W-002` 등)를 선택한다.
5. `근거 상세` 영역에서 선택된 구간의 대표 프레임 이미지와 각도/원인 정보가 함께 표시된다.
6. 기존 `최대 위험 순간` 단독 이미지 섹션은 화면에서 사라진다.

## 현재 구조

### 이미지 생성 위치

- 파일: `backend/app/video_analyzer/analyzer_sec.py`
- 현재 `analyze_video_per_second()` 내부에서 최고 RULA 점수가 갱신될 때만 `worst_img`를 만든다.
- 최종 반환값은 `generate_final_report()`에서 다음 형태로 내려간다.

```python
"worst": {"img": worst_img, "sec": worst_sec, "score": max_s}
```

### 이미지 전달 위치

- 파일: `backend/app/services/video_adapter.py`
- 현재 `analyze_video_upload()`에서 `worst.img`만 data URL로 바꾼다.

```python
media = {"peak_image_data_url": image_to_data_url(raw.get("worst", {}).get("img"))}
```

### 이미지 표시 위치

- 파일: `frontend/src/App.jsx`
- 현재 결과 요약 바로 아래에서 단독 이미지 컴포넌트를 렌더링한다.

```jsx
<PeakRiskImage imageDataUrl={result?.media?.peak_image_data_url} peakEvent={result?.canonical?.peak_risk_event} />
```

- 파일: `frontend/src/components/PeakRiskImage.jsx`
- `최대 위험 순간` 이미지만 표시하는 전용 컴포넌트다.

### 위험구간 선택과 근거 상세

- 파일: `frontend/src/App.jsx`
- `selectedWindowId` 기준으로 선택된 위험구간을 찾고, 해당 구간의 `representative_frame_ids`에 해당하는 프레임을 `selectedFrames`로 만든다.

```jsx
const ids = new Set(selectedWindow.representative_frame_ids);
return result.canonical.frames.filter((frame) => ids.has(frame.frame_id));
```

- 파일: `frontend/src/components/EvidencePanel.jsx`
- 현재는 선택된 위험구간의 대표 프레임 점수, 각도, 원인만 표시하고 이미지는 표시하지 않는다.

## 변경할 데이터 계약

기존 `media.peak_image_data_url` 중심 구조에서, 프레임 ID로 이미지를 찾을 수 있는 map 구조를 추가한다.

```json
{
  "media": {
    "frame_image_data_urls": {
      "F-000012": "data:image/png;base64,...",
      "F-000013": "data:image/png;base64,..."
    },
    "image_source": "video_analyzer_sample_frames"
  }
}
```

이 구조를 쓰는 이유:

- `canonical.frames[].frame_id`와 바로 매칭할 수 있다.
- `selectedWindow.representative_frame_ids`를 그대로 사용할 수 있다.
- 위험구간 선택이 바뀌어도 프론트에서 추가 API 호출 없이 즉시 이미지가 바뀐다.
- 기존 JSON 업로드 흐름에서는 이미지가 없을 수 있으므로 `frame_image_data_urls`가 없으면 안내 문구만 표시하면 된다.

## 백엔드 실행 계획

### 1. 영상 분석기에서 위험 샘플 이미지 수집

수정 파일:

- `backend/app/video_analyzer/analyzer_sec.py`

현재는 최고점 이미지만 `worst_img`로 저장한다. 여기에 위험 프레임 이미지 목록을 추가한다.

추가할 반환 구조:

```python
"frame_images": [
    {
        "sample_index": 0,
        "sec": 0.5,
        "score": 6,
        "img": rgb_image,
    }
]
```

실행 방식:

- `analyze_video_per_second(video_path, load_kg=0, leg_score=1, image_score_threshold=5)`처럼 선택 파라미터를 추가한다.
- `eval_res.rula_score >= image_score_threshold`인 샘플만 이미지로 저장한다.
- 저장 이미지에는 현재 `worst_img`와 동일하게 관절 선, 관절점, RULA 점수를 그린다.
- 중복 코드를 줄이기 위해 프레임에 관절 오버레이를 그리는 작은 내부 함수로 분리한다.
- 영상 길이가 길 경우 응답이 커질 수 있으므로 모든 프레임이 아니라 위험 기준 이상 샘플만 저장한다.

주의:

- `hold frame`으로 보간된 샘플은 실제 관절 감지가 아닌 이전 추정값일 수 있으므로 이미지 저장 대상에서 제외하거나, 이미지가 없을 수 있음을 프론트에서 허용한다.
- 현재 분석 샘플은 0.5초 단위이므로 `sample_index` 순서가 `canonical.frames`의 `F-000001`, `F-000002`와 일치한다.

### 2. video_adapter에서 frame_id 기반 media map 생성

수정 파일:

- `backend/app/services/video_adapter.py`

추가할 함수:

```python
def build_frame_image_media(raw: dict[str, Any]) -> dict[str, str]:
    ...
```

실행 방식:

- `raw["frame_images"]`를 순회한다.
- `sample_index`를 기준으로 `F-{sample_index + 1:06d}`를 만든다.
- 각 이미지 배열을 `image_to_data_url()`로 변환한다.
- `frame_image_data_urls[frame_id] = data_url` 형태로 저장한다.

변경 예시:

```python
frame_images = build_frame_image_media(raw)
media = {
    "frame_image_data_urls": frame_images,
    "image_source": "video_analyzer_sample_frames",
}
```

호환성:

- 기존 `peak_image_data_url`은 프론트에서 더 이상 사용하지 않는다.
- 필요하면 1차 변경에서는 `peak_image_data_url`을 유지하되, 화면 렌더링만 제거한다. 이렇게 하면 기존 테스트나 외부 사용자가 깨질 가능성이 낮다.

### 3. 영상 요약에 구간 이미지 여부 추가

수정 파일:

- `backend/app/services/video_adapter.py`

현재 `build_video_summary()`는 `has_peak_image`만 내려준다. 이를 다음처럼 바꾼다.

```python
"has_frame_images": bool(media.get("frame_image_data_urls")),
"frame_image_count": len(media.get("frame_image_data_urls") or {}),
```

기존 `has_peak_image`는 유지하거나 제거할 수 있지만, UI 기준은 `has_frame_images`로 옮긴다.

### 4. 테스트 보강

수정 파일:

- `backend/tests/test_video_adapter.py`

추가 확인:

- fake raw result에 `frame_images`를 넣는다.
- `build_frame_image_media()`가 `F-000001`, `F-000003` 같은 frame_id key를 만드는지 확인한다.
- `run_analysis_payload(..., media=media)` 결과에 `media.frame_image_data_urls`가 유지되는지 확인한다.

## 프론트엔드 실행 계획

### 1. 최대 위험 순간 단독 표시 제거

수정 파일:

- `frontend/src/App.jsx`
- `frontend/src/components/PeakRiskImage.jsx`
- `frontend/src/styles.css`

실행 방식:

- `App.jsx`에서 `PeakRiskImage` import를 제거한다.
- 다음 렌더링을 삭제한다.

```jsx
<PeakRiskImage imageDataUrl={result?.media?.peak_image_data_url} peakEvent={result?.canonical?.peak_risk_event} />
```

- `PeakRiskImage.jsx`는 더 이상 쓰지 않으므로 삭제하거나 남겨두되 import가 없도록 한다. 정리 관점에서는 삭제가 낫다.
- `.peak-image-panel` 관련 CSS는 제거하거나 새 EvidencePanel 이미지 스타일로 대체한다.

### 2. selectedFrames에 이미지 매칭

수정 파일:

- `frontend/src/App.jsx`

실행 방식:

- `result.media.frame_image_data_urls`를 읽는다.
- `selectedFrames`를 만들 때 각 frame에 `imageDataUrl`을 붙인다.

예상 형태:

```jsx
const selectedFrames = useMemo(() => {
  if (!result || !selectedWindow) return [];
  const ids = new Set(selectedWindow.representative_frame_ids);
  const imageMap = result.media?.frame_image_data_urls || {};

  return result.canonical.frames
    .filter((frame) => ids.has(frame.frame_id))
    .map((frame) => ({
      ...frame,
      imageDataUrl: imageMap[frame.frame_id] || null,
    }));
}, [result, selectedWindow]);
```

이렇게 하면 `EvidencePanel`은 별도 media prop 없이 `frames`만 보고 이미지를 표시할 수 있다.

### 3. EvidencePanel에 구간 이미지 표시

수정 파일:

- `frontend/src/components/EvidencePanel.jsx`

실행 방식:

- `frames` 중 `imageDataUrl`이 있는 항목만 추린다.
- `evidence-meta` 아래에 이미지 영역을 추가한다.
- 대표 프레임 이미지가 여러 장이면 작은 갤러리로 표시한다.
- 이미지가 없으면 짧은 안내 문구를 표시한다.

예상 UI 구조:

```jsx
const imageFrames = frames.filter((frame) => frame.imageDataUrl);

{imageFrames.length > 0 ? (
  <div className="evidence-image-grid">
    {imageFrames.map((frame) => (
      <figure key={`${frame.frame_id}-image`}>
        <img src={frame.imageDataUrl} alt={`${frame.frame_id} 위험 자세 이미지`} />
        <figcaption>{frame.frame_id} · {frame.time_sec}s · RULA {frame.frame_score}</figcaption>
      </figure>
    ))}
  </div>
) : (
  <p className="muted">이 위험구간에 연결된 대표 이미지가 없습니다.</p>
)}
```

### 4. CSS 추가

수정 파일:

- `frontend/src/styles.css`

추가할 클래스:

- `.evidence-image-grid`
- `.evidence-image-grid figure`
- `.evidence-image-grid img`
- `.evidence-image-grid figcaption`

디자인 기준:

- 근거 상세 패널 내부에 자연스럽게 붙도록 과한 카드 중첩은 피한다.
- 이미지는 `object-fit: contain`, 어두운 배경, `border-radius: 8px` 정도로 정리한다.
- 모바일에서는 1열, 데스크톱에서는 2열 또는 3열로 자동 배치한다.

## 처리하지 않는 것

이번 변경에서는 다음은 하지 않는다.

- 이미지를 파일로 저장하지 않는다.
- ZIP export 구조를 새로 만들지 않는다.
- JSON 업로드만 하는 기존 흐름에 이미지 필드를 강제하지 않는다.
- LLM 프롬프트에 이미지를 넣지 않는다. 이미지는 사용자 확인용 화면 근거로만 쓴다.

## 예상 수정 파일 목록

백엔드:

- `backend/app/video_analyzer/analyzer_sec.py`
- `backend/app/services/video_adapter.py`
- `backend/tests/test_video_adapter.py`

프론트엔드:

- `frontend/src/App.jsx`
- `frontend/src/components/EvidencePanel.jsx`
- `frontend/src/components/PeakRiskImage.jsx`
- `frontend/src/styles.css`

필요 시:

- `backend/app/services/pipeline.py`: media 구조를 그대로 통과시키는 현재 구조가 유지되면 수정 불필요
- `backend/tests/test_pipeline.py`: media 통과 계약까지 검증하고 싶으면 보강

## 구현 순서

1. `analyzer_sec.py`에서 위험 샘플 이미지 목록을 수집하도록 수정한다.
2. `video_adapter.py`에서 `frame_image_data_urls` media map을 만든다.
3. 백엔드 테스트를 추가하고 `pytest`를 실행한다.
4. `App.jsx`에서 `PeakRiskImage` 렌더링을 제거하고 selected frame에 imageDataUrl을 붙인다.
5. `EvidencePanel.jsx`에서 선택 위험구간의 대표 프레임 이미지를 표시한다.
6. `styles.css`에 근거 상세 이미지 스타일을 추가하고 peak image 스타일을 제거한다.
7. `npm run build`로 프론트 빌드를 확인한다.
8. 실제 영상 업로드 후 `위험 구간` 카드를 바꿔가며 근거 상세 이미지가 바뀌는지 확인한다.

## 검증 기준

백엔드:

```powershell
cd C:\Users\leecs\Desktop\캡스톤디자인\33_웹4\backend
..\.venv\Scripts\python.exe -m pytest
```

프론트엔드:

```powershell
cd C:\Users\leecs\Desktop\캡스톤디자인\33_웹4\frontend
npm run build
```

수동 확인:

1. 백엔드와 프론트를 실행한다.
2. 영상을 업로드한다.
3. `영상 분석`을 누른다.
4. `결과분석`을 누른다.
5. 결과 화면에서 `최대 위험 순간` 단독 섹션이 보이지 않는지 확인한다.
6. `위험 구간` 카드 선택 시 오른쪽 `근거 상세` 이미지가 선택 구간에 맞게 바뀌는지 확인한다.
7. 이미지가 없는 구간에서는 오류 대신 안내 문구가 보이는지 확인한다.

## 리스크와 대응

### 응답 크기 증가

위험 프레임 이미지를 data URL로 여러 장 내려주면 응답 크기가 커질 수 있다.

대응:

- 모든 분석 샘플이 아니라 RULA 점수가 위험 기준 이상인 샘플만 저장한다.
- 필요하면 `representative_frame_ids`에 해당하는 이미지로 한 번 더 줄이는 2단계 최적화를 적용한다.

### 대표 프레임에 이미지가 없을 수 있음

보간 프레임이거나 관절 검출이 안정적이지 않은 샘플은 이미지가 없을 수 있다.

대응:

- 프론트에서 이미지가 없는 대표 프레임은 텍스트 근거만 표시한다.
- 이미지 영역에는 “이 위험구간에 연결된 대표 이미지가 없습니다.” 문구를 표시한다.

### 기존 JSON 업로드 흐름과 차이

JSON만 업로드하는 기존 구조에는 이미지가 없다.

대응:

- `media.frame_image_data_urls`를 optional로 처리한다.
- 이미지가 없더라도 결과 분석과 근거 상세 텍스트는 기존처럼 동작하게 유지한다.

