# 결과화면 첫 분석결과 영역 구현 계획서

## 1. 목적

`result_summary_ux_spec.md`의 요구사항에 맞춰 결과 화면 최상단의 첫 분석결과 영역을 단순 점수/부위 나열이 아니라, 사용자가 5초 안에 핵심 위험과 우선 개선 행동을 이해할 수 있는 진단형 요약 영역으로 개편한다.

이번 구현의 핵심은 다음 질문에 답하는 화면을 만드는 것이다.

> 이 작업에서 가장 먼저 고쳐야 할 문제는 무엇인가?

## 2. 현재 코드 기준

현재 프로젝트는 이미 다음 구조를 갖고 있다.

| 영역 | 현재 파일 | 현재 역할 |
|---|---|---|
| 결과 최상단 UI | `frontend/src/components/ResultSummary.jsx` | `risk_summary`, `risk_highlights`, 점수 카드, 검증 상태 표시 |
| 결과 화면 조립 | `frontend/src/App.jsx` | 업로드 후 `ResultSummary`, 차트, 위험 구간, 근거 패널 렌더링 |
| LLM 응답 스키마 | `backend/app/services/llm_client.py` | `risk_summary`, `risk_highlights`, `task_summary`, findings, recommendations 생성 |
| 계산 근거 생성 | `backend/app/services/evidence_builder.py` | `computed_summary`, 대표 위험 구간, 주요 부위/요인, fallback 요약 생성 |
| 응답 검증 | `backend/app/services/verifier.py` | evidence id, 절차형 요약, 의학적 표현, 근거 없는 숫자 검증 |
| 파이프라인 응답 | `backend/app/services/pipeline.py` | canonical, evidence_bundle, llm_result, verification 반환 |
| 테스트 | `backend/tests/test_pipeline.py` | 샘플 변환, provider, 요약 fallback, verifier 검증 |

현재 구현은 `risk_summary` 중심의 1차 개선은 되어 있지만, UX 스펙이 요구하는 4개 정보 블록과 구조화된 LLM 출력 필드는 아직 부족하다.

## 3. 목표 화면 구조

결과 화면 첫 영역은 다음 순서로 구성한다.

1. 한 줄 진단
2. 위험 판정
3. 핵심 위험 원인
4. 우선 개선 행동
5. 우선 확인 구간
6. Top 3 개선 행동
7. 기존 점수/검증 정보

권장 UI 형태:

```text
[한 줄 진단]
몸통을 비튼 상태에서 손목을 반복적으로 사용하는 자세가 핵심 위험입니다.

[위험 판정]
즉시 개선 필요
현재 작업은 몸통, 목, 손목 부담이 함께 누적되는 고위험 작업입니다.

[핵심 원인]
가장 큰 원인: 몸통 비틀림
몸통이 정면을 벗어난 상태에서 목 비틀림과 손목 부담이 함께 나타났습니다.

[먼저 고칠 것]
작업 대상을 몸 정면에 배치하세요.
손목이 꺾이지 않도록 작업 높이와 방향을 조정합니다.

[먼저 볼 구간]
00:15~00:21 구간처럼 고위험 자세가 길게 이어진 장면을 먼저 확인합니다.
```

## 4. 백엔드 구현 계획

### 4.1 LLM 응답 스키마 확장

수정 파일:

- `backend/app/services/llm_client.py`

`ANALYSIS_RESPONSE_SCHEMA`에 첫 분석 요약 전용 필드를 추가한다.

```json
{
  "first_analysis_summary": {
    "headline": "",
    "risk_level_summary": "",
    "main_risk_cause": "",
    "priority_action": "",
    "focus_time_range": "",
    "top_3_actions": []
  }
}
```

기존 호환을 위해 `risk_summary`, `risk_highlights`, `task_summary`는 유지한다. 프론트는 새 필드가 있으면 우선 사용하고, 없으면 기존 필드로 fallback한다.

### 4.2 computed_summary 확장

수정 파일:

- `backend/app/services/evidence_builder.py`

현재 `computed_summary`에 있는 값:

- final_score
- final_action
- high_risk_window_count
- main_body_parts
- main_drivers
- high_risk_times
- fallback_risk_summary
- risk_highlights

추가할 값:

| 필드 | 목적 |
|---|---|
| `primary_driver` | 핵심 원인 1개 압축 |
| `supporting_drivers` | 보조 원인 최대 3개 |
| `priority_focus_windows` | 첫 화면에 보여줄 대표 구간 최대 3개 |
| `recommended_action_seed` | 규칙 기반 우선 개선 행동 seed |
| `first_summary_fallback` | LLM 실패 또는 필드 누락 시 사용할 구조화 fallback |

대표 구간 선정 기준은 스펙의 우선순위를 따른다.

1. RULA 점수 7 구간
2. RULA 점수 6 이상이 연속으로 이어진 구간
3. 여러 위험 flag가 동시에 true인 구간
4. 최고 위험 이벤트가 포함된 구간
5. 특정 부위 각도 변화가 큰 구간

### 4.3 위험 요인별 개선방안 매핑 추가

수정 파일:

- `backend/app/services/evidence_builder.py`
- 필요 시 `backend/app/services/recommendation_rules.py` 신규 생성

위험 요인별 기본 개선 행동을 규칙으로 둔다.

| 위험 요인 | 우선 개선 행동 |
|---|---|
| 몸통 비틀림 | 작업 대상을 몸 정면에 배치 |
| 몸통 굴곡 | 작업대 높이 조정, 대상물 위치 올리기 |
| 목 비틀림 | 시선 방향과 작업 방향 일치 |
| 목 굴곡 | 대상물 높이 조정, 시야 확보 |
| 손목 부담 | 손목 중립 자세 유지, 작업 높이/방향 조정 |
| 손목 편위 | 회전 동작 줄이기, 도구 손잡이 개선 |
| 상완 거상 | 팔을 몸 가까이에 두기, 작업 거리 줄이기 |
| 반복/정적 자세 | 작업 분할, 짧은 휴식, 작업 순서 변경 |
| 과도한 하중 | 하중 감소, 보조 장비 사용 |

이 매핑은 LLM 입력과 fallback 모두에서 사용한다.

### 4.4 프롬프트 수정

수정 파일:

- `backend/app/services/llm_client.py`

`SYSTEM_PROMPT`에 다음 규칙을 추가한다.

- 첫 문장은 점수보다 진단으로 시작한다.
- 위험 부위만 나열하지 않는다.
- 가장 중요한 원인을 1개로 압축한다.
- 바로 실행 가능한 개선 행동을 포함한다.
- 대표 위험 구간은 최대 3개만 언급한다.
- 의학적 진단이나 질병 발생 단정 표현을 금지한다.
- `first_analysis_summary` 필드는 결과 화면 최상단 카드에 그대로 표시될 수 있게 짧고 명확하게 작성한다.

### 4.5 fallback 및 정규화 처리

수정 파일:

- `backend/app/services/llm_client.py`

`_normalize_summary_fields()`를 확장해 다음을 보장한다.

- `first_analysis_summary`가 없으면 `computed_summary.first_summary_fallback`으로 채운다.
- `headline`이 절차 설명이면 fallback headline으로 교체한다.
- `top_3_actions`가 비어 있으면 위험 요인 매핑 기반 행동 3개를 채운다.
- `focus_time_range`가 너무 많은 구간을 나열하면 대표 구간 1~3개만 남긴다.

## 5. 프론트엔드 구현 계획

### 5.1 ResultSummary UI 재구성

수정 파일:

- `frontend/src/components/ResultSummary.jsx`

현재 하나의 큰 `riskSummary` 문장과 highlight pill을 중심으로 표시한다. 이를 다음 구조로 바꾼다.

```jsx
const firstSummary = llm.first_analysis_summary || buildFirstSummaryFallback(llm, computed);

<section className="summary-band">
  <div className="diagnosis-header">
    <p className="eyebrow">첫 분석 요약</p>
    <h2>{firstSummary.headline}</h2>
    <StatusPill />
  </div>

  <div className="first-summary-grid">
    <SummaryCard title="위험 판정" value={firstSummary.risk_level_summary} />
    <SummaryCard title="핵심 원인" value={firstSummary.main_risk_cause} />
    <SummaryCard title="먼저 고칠 것" value={firstSummary.priority_action} emphasis />
    <SummaryCard title="먼저 볼 구간" value={firstSummary.focus_time_range} />
  </div>

  <TopActions actions={firstSummary.top_3_actions} />
  <MetricRow />
</section>
```

### 5.2 카드 표시 규칙

- 카드 안 문장은 1~2문장으로 제한한다.
- `먼저 고칠 것` 카드는 가장 눈에 띄게 강조한다.
- `먼저 볼 구간`에는 전체 구간 목록이 아니라 대표 구간만 표시한다.
- 기존 `risk_highlights`는 보조 태그로 유지하되, 첫 화면 주인공은 새 4개 카드로 둔다.

### 5.3 CSS 수정

수정 파일:

- `frontend/src/styles.css`

추가할 스타일:

- `.diagnosis-header`
- `.first-summary-grid`
- `.first-summary-card`
- `.first-summary-card.action`
- `.top-actions`
- `.time-focus-list`

반응형 기준:

- 데스크톱: 2x2 카드 그리드
- 모바일: 1열 카드
- 긴 문장은 줄바꿈되며 카드 밖으로 넘치지 않게 처리

## 6. 검증 계획

### 6.1 백엔드 테스트

수정 파일:

- `backend/tests/test_pipeline.py`

추가 테스트:

1. `first_analysis_summary` 필드가 항상 존재한다.
2. `headline`에 절차형 표현이 들어가면 fallback으로 교체된다.
3. `main_risk_cause`는 빈 문자열이 아니며 핵심 원인 1개를 중심으로 생성된다.
4. `top_3_actions`는 1~3개이며 구체적 행동 문장이다.
5. `focus_time_range`는 대표 구간 3개를 넘지 않는다.
6. fallback 모드에서도 첫 분석 요약 카드가 렌더링 가능한 구조로 반환된다.

### 6.2 프론트엔드 검증

확인 항목:

- 샘플 JSON 업로드 후 최상단에 한 줄 진단이 표시된다.
- 4개 카드가 모두 표시된다.
- 기존 `risk_summary`만 있는 응답도 화면이 깨지지 않는다.
- 모바일 폭에서 카드 텍스트가 겹치지 않는다.
- “분석을 통해”, “평가를 수행했습니다” 같은 절차형 문구가 최상단 headline에 나오지 않는다.

실행 명령:

```powershell
cd C:\Users\leecs\Desktop\캡스톤디자인\31_웹2\backend
..\.venv\Scripts\python.exe -m pytest

cd C:\Users\leecs\Desktop\캡스톤디자인\31_웹2\frontend
npm run build
```

## 7. 구현 순서

### 1단계: 데이터 계약 확정

- `ANALYSIS_RESPONSE_SCHEMA`에 `first_analysis_summary` 추가
- fallback 구조 정의
- 기존 응답과의 호환 규칙 확정

완료 기준:

- OpenAI/Ollama/fallback 응답 모두 같은 UI 계약을 만족한다.

### 2단계: 계산 기반 seed 생성

- `computed_summary` 확장
- 대표 구간 1~3개 선정
- 위험 요인별 개선 행동 매핑

완료 기준:

- LLM 없이도 첫 분석 요약 카드에 들어갈 최소 문구를 만들 수 있다.

### 3단계: LLM 프롬프트 및 정규화

- 진단형 요약 프롬프트 반영
- 절차형/의학적/과장 표현 정규화 강화
- 누락 필드 fallback 처리

완료 기준:

- LLM 결과가 스펙의 4개 정보 블록으로 안정적으로 변환된다.

### 4단계: UI 카드 구현

- `ResultSummary.jsx` 재구성
- 4개 카드와 Top 3 행동 표시
- 기존 metric row와 verifier 상태 유지

완료 기준:

- 첫 화면에서 위험 단계, 핵심 원인, 우선 행동, 확인 구간이 바로 보인다.

### 5단계: 테스트 및 빌드

- 백엔드 pytest 보강
- 프론트 빌드 검증
- 샘플 JSON 업로드 수동 확인

완료 기준:

- 자동 테스트 통과
- `npm run build` 성공
- 샘플 결과 최상단 문구가 명세서의 나쁜 예시에 해당하지 않음

## 8. 최종 완료 기준

다음 조건을 만족하면 구현 완료로 본다.

| 항목 | 완료 기준 |
|---|---|
| 진단성 | 첫 문장이 점수 나열이 아니라 핵심 위험 진단으로 시작 |
| 명확성 | 가장 큰 위험 원인 1개가 분명히 표시 |
| 실행 가능성 | 우선 개선 행동이 구체적으로 제시 |
| 구간 안내 | 대표 확인 구간이 1~3개로 압축 |
| 안전성 | 의학적 진단/질병 발생 단정 표현 없음 |
| 정확성 | 입력 데이터에 없는 숫자, 부위, 시간 생성 없음 |
| 호환성 | 기존 `risk_summary` 응답도 화면에서 fallback 가능 |
| 검증성 | pytest와 frontend build 통과 |

## 9. 작업 시 주의사항

- 이 웹앱은 JSON을 읽고 설명하는 결과 대시보드이며, 영상 분석 기능을 추가하지 않는다.
- LLM 자유 생성에만 의존하지 않고 백엔드 계산값 기반 fallback을 반드시 유지한다.
- 첫 화면에는 모든 위험 구간을 나열하지 않는다.
- “몸통, 손목, 목이 위험합니다” 같은 나열형 문장을 최상단 핵심 문장으로 쓰지 않는다.
- “근골격계 질환이 발생합니다”처럼 의학적 결과를 단정하지 않는다.
- 작업자 비난 표현 대신 작업 환경과 작업 조건 개선 중심으로 표현한다.
