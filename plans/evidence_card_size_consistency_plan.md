# 근거 상세 카드 크기 통일 계획

## 목표

결과 화면의 `근거 상세` 영역에서 위험구간마다 표시되는 근거 카드 개수가 다를 때도 카드 크기가 일정하게 보이도록 수정한다.

현재 증상:

- 어떤 위험구간은 근거 상세 카드가 1개만 표시된다.
- 어떤 위험구간은 근거 상세 카드가 2개 이상 표시된다.
- 카드가 1개일 때는 카드가 가로폭을 넓게 차지하고, 2개 이상일 때는 카드가 나뉘어 작게 표시된다.
- 결과적으로 위험구간을 선택할 때마다 카드 크기가 달라져 화면이 흔들려 보인다.

## 원인

수정 대상 파일:

- `frontend/src/components/EvidencePanel.jsx`
- `frontend/src/styles.css`

현재 CSS는 다음 구조다.

```css
.frame-grid {
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
}

.evidence-image-grid {
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
}
```

`auto-fit`과 `1fr` 조합은 항목 수가 적을 때 남는 공간을 카드가 전부 차지한다. 그래서 카드가 1개면 크게 늘어나고, 카드가 2개 이상이면 나눠 배치된다.

## 실행 방향

### 1. 텍스트 근거 카드 폭 고정

수정 파일:

- `frontend/src/styles.css`

`.frame-grid`를 남은 공간에 따라 늘어나는 구조가 아니라, 일정한 카드 폭을 유지하는 구조로 바꾼다.

예상 변경:

```css
.frame-grid {
  grid-template-columns: repeat(auto-fill, minmax(190px, 220px));
  justify-content: start;
}
```

효과:

- 카드가 1개여도 220px 정도의 폭을 유지한다.
- 카드가 2개 이상이어도 같은 폭으로 배치된다.
- 남는 공간은 오른쪽 여백으로 남는다.

### 2. 텍스트 근거 카드 높이 통일

수정 파일:

- `frontend/src/styles.css`

`.frame-card` 내부를 세로 flex 구조로 바꾸고 최소 높이를 지정한다.

예상 변경:

```css
.frame-card {
  display: flex;
  flex-direction: column;
  min-height: 176px;
}

.frame-card > div:first-child {
  min-height: 40px;
}

.frame-card dl {
  flex: 1;
}

.frame-card p {
  min-height: 34px;
}
```

효과:

- 위험 원인 텍스트 길이가 다르더라도 카드 전체 높이가 비슷하게 유지된다.
- 카드 제목/시간 영역, 각도 표, 원인 영역이 같은 위치에 정렬된다.

### 3. 이미지 근거 카드도 같은 방식으로 정리

수정 파일:

- `frontend/src/styles.css`

현재 이미지 영역도 `auto-fit` + `1fr`이라 이미지가 1장일 때 크게 늘어날 수 있다. 텍스트 카드와 같은 원칙으로 폭을 일정하게 맞춘다.

예상 변경:

```css
.evidence-image-grid {
  grid-template-columns: repeat(auto-fill, minmax(240px, 280px));
  justify-content: start;
}

.evidence-image-grid figure {
  display: flex;
  flex-direction: column;
  min-height: 210px;
}

.evidence-image-grid img {
  height: 158px;
}

.evidence-image-grid figcaption {
  min-height: 32px;
}
```

효과:

- 이미지가 1장이어도 패널 전체 폭으로 커지지 않는다.
- 이미지가 2장 이상이어도 동일한 크기의 이미지 카드처럼 보인다.
- 캡션 길이에 따른 높이 흔들림을 줄인다.

### 4. 모바일에서는 1열 전체 폭 허용

수정 파일:

- `frontend/src/styles.css`

모바일 화면에서는 고정 폭 카드가 오히려 좁아 보일 수 있으므로 기존 미디어 쿼리 안에서 1열 전체 폭으로 바꾼다.

예상 변경:

```css
@media (max-width: 760px) {
  .frame-grid,
  .evidence-image-grid {
    grid-template-columns: 1fr;
  }

  .frame-card,
  .evidence-image-grid figure {
    width: 100%;
  }
}
```

효과:

- 데스크톱에서는 카드 크기가 고정되어 선택 변경 시 흔들림이 줄어든다.
- 모바일에서는 화면 폭을 자연스럽게 사용한다.

## 수정할 파일

필수 수정:

- `frontend/src/styles.css`

선택 수정:

- `frontend/src/components/EvidencePanel.jsx`

`EvidencePanel.jsx`는 현재 구조로도 CSS만 바꾸면 해결 가능하다. 다만 이미지 카드와 텍스트 카드에 별도 class가 필요하면 `figure`나 `article`에 className을 추가한다.

## 구현 순서

1. `frontend/src/styles.css`에서 `.frame-grid`를 고정 폭 grid로 변경한다.
2. `.frame-card`에 `display: flex`, `min-height`, 내부 영역 정렬 규칙을 추가한다.
3. `.evidence-image-grid`도 고정 폭 grid로 변경한다.
4. 이미지 카드 `figure`, `img`, `figcaption`의 높이 기준을 통일한다.
5. 모바일 미디어 쿼리에서 `.frame-grid`, `.evidence-image-grid`를 `1fr`로 되돌린다.
6. `npm run build`로 프론트 빌드 확인한다.
7. 실제 결과 화면에서 위험구간을 바꿔가며 카드 1개/2개 이상일 때 크기가 같은지 확인한다.

## 검증 기준

프론트 빌드:

```powershell
cd C:\Users\leecs\Desktop\캡스톤디자인\33_웹4\frontend
npm run build
```

수동 확인:

1. 결과 화면에서 위험구간 카드 `W-001`, `W-002` 등을 번갈아 선택한다.
2. 근거 상세의 텍스트 카드가 1개일 때와 2개 이상일 때 폭이 동일한지 확인한다.
3. 이미지 근거 카드도 1장일 때와 여러 장일 때 폭이 동일한지 확인한다.
4. 모바일 폭으로 줄였을 때 카드가 화면 밖으로 넘치지 않고 1열로 표시되는지 확인한다.

## 주의점

- 카드 크기를 맞추기 위해 텍스트를 숨기지는 않는다.
- 원인 텍스트가 길어질 수 있으므로 카드 높이는 너무 낮게 잡지 않는다.
- 데스크톱 기준 카드 폭은 `190px~220px`, 이미지 카드 폭은 `240px~280px` 정도에서 시작하고 실제 화면을 보고 조정한다.
- `workspace-grid` 전체 레이아웃은 건드리지 않고 `근거 상세` 내부 카드만 조정한다.

