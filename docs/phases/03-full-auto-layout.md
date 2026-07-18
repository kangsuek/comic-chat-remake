# Phase 3 — 완전 자동 레이아웃 (진짜 "코믹챗스러움")

**목표**: 원작의 핵심 매력인 패널 클론/연속성, 캐릭터 그리디 배치(방향/거리 페널티), 랜덤 말풍선 크기/위치, 줌 스냅을 포팅한다. 이벤트 소싱(HistoryEntry replay)을 백엔드의 근본 구조로 승격한다.

**데모 기준**: 여러 명이 대화하면 같은 장면이 이어질 때 패널이 이어붙고(클론), 대화 상대를 향해 캐릭터가 자동으로 배치/회전하며, 말풍선 크기가 매번 랜덤하게 다르지만 겹치지 않는다. 페이지를 새로고침해도(replay) 동일한 만화가 재구성된다.

## 선행 조건
- Phase 2 완료 (아바타 렌더링 파이프라인)

## 작업 목록

### 0. 스파이크 — 패널 클론-확장 상태 모델
- [ ] "현재 패널(mutable draft)" vs "확정된 패널(불변 스냅샷)" 데이터 모델을 먼저 프로토타입하고, 이벤트소싱 replay 결과와 실시간 증분 업데이트 결과가 항상 동일함을 확인하는 작은 스크립트 작성

### 1. 이벤트 소싱 백엔드 (`apps/server`)
- [ ] SQLite(`better-sqlite3`) 도입: `events(id, room_id, seq, ts, actor_id, type, payload_json)` append-only 테이블
- [ ] `room_snapshot` 캐시 테이블 (패널 상태), 패널 폭 변경 시 무효화
- [ ] `foldEvents(events[]): PanelState[]` — `comic-engine`의 순수 함수로 구현 (서버 전용 아님, 클라도 재사용)
- [ ] 재접속 시 이벤트 로그 replay로 상태 복구

### 2. 패널 생성/클론 로직 (`packages/comic-engine/src/panel/`)
- [ ] `shouldStartNewPanel(currentPanel, speakerId, mode): boolean` — 강제(액션), 요소 ≥5개, 패널 <2개, 발화자 이미 존재 조건 포팅 (`panel.cpp`의 `AddLine` 앞부분)
- [ ] `clonePanel(panel): Panel` — 깊은 복사 (bodies + balloons, speaker 참조 재연결)
- [ ] `addLineToPanel(panel, line, rng): Panel | LayoutFailure` — 실패 시 상위에서 새 패널로 재시도(백트래킹)하는 구조로 설계

### 3. 캐릭터 그리디 배치 (`packages/comic-engine/src/panel/placement.ts`)
- [ ] `addTalkTos()`: 발화자의 `talkTo` 목록을 최대 5명까지 패널에 포함 (`panel.cpp`의 `AddTalkTos`)
- [ ] `evalPair(b1, b2, deltaPlacement)`: 방향/거리 페널티 계산 — 상대를 안 보면 +40, 거리비례 +4×(거리-1), 상대가 날 안 보면 +4 (원작 상수 그대로 포팅)
- [ ] `evalPlacement()`/`doGreedyOrdering()`: 모든 삽입 위치×양방향에 대해 `evalPlacement` 합산 최소값 선택, 동점 시 `lastDir`로 타이브레이크
- [ ] `updateHysteresis()`: 배치 후 각 아바타의 `lastRight/lastLeft/lastDir` 갱신 (다음 패널 배치에 영향)
- [ ] 단위 테스트: 다양한 talkTo 그래프/인원수 조합 퍼징 (예외/NaN 없는지만 체크), 골든파일 스냅샷 몇 개

### 4. 줌 로직
- [ ] `computeZoom(bodies, panelSize): number` — 최대 신장 정규화, 폭 초과 시 축소, establishing shot 아니면 머리 안 잘리는 한도까지 줌인, 1.1배 미만 변화는 1.0 스냅

### 5. 말풍선 크기/위치 + route-region 충돌 회피
- [ ] `estimateBalloonSize(text, freeRect, rng)`: 텍스트 길이 기반, 짧으면 1줄, 길면 1~3줄 목표 랜덤 산정 (`ONELINETHRESHOLD` 상수 이식)
- [ ] `positionBalloon(anchorX, goalWidth, freeRect, rng)`: 화자의 arrowX 앵커 근처 랜덤 배치, 가용 공간으로 클램프
- [ ] **스파이크**: route-region(말풍선 꼬리 경로) 충돌 회피 알고리즘 프로토타입 — 원작 스플라인 수식은 포팅하지 않고, 랜덤 둥근 말풍선 + 꼬리를 Canvas 경로로 재구현. 여러 화자가 있는 패널 몇 개로 눈으로 검증 후 본 엔진에 편입
- [ ] 말풍선이 패널에 안 들어가면 텍스트 강제 분할 후 다음 패널로 이어붙임 (`leftOver` 메커니즘)
- [ ] `SpeechBubble` 컴포넌트를 `Konva.Shape`의 `sceneFunc` 커스텀 경로로 교체 (Phase 2의 단순 버전 대체)

### 6. 시드 기반 재현성
- [ ] 패널 생성 시 시드 고정(`m_seed` 개념 포팅), 모든 랜덤 함수가 시드 PRNG를 인자로 받도록 강제
- [ ] 랜덤 레이아웃 "결정 결과"(말풍선 폭/위치, 줌 스냅 값, 배치 순서)를 이벤트 payload에 함께 저장 → replay는 순수 fold(재계산 없이 저장된 값 사용)로 bit-exact 보장

## 완료 조건 (Acceptance)
- [ ] 같은 화자가 연속 발화 시 패널이 클론되어 이어붙는 것이 시각적으로 확인됨
- [ ] A가 B에게 말을 걸면(talkTo) B를 향해 캐릭터가 자동으로 방향을 바꿈
- [ ] 여러 말풍선이 겹치지 않고, 크기가 메시지마다 랜덤하게 다름
- [ ] 브라우저 새로고침 후 서버에서 replay한 만화가 새로고침 전과 픽셀 단위는 아니어도 배치/포즈/텍스트가 동일함 (JSON 비교로 검증)

## 리스크 / 메모
- 이 단계가 전체 프로젝트에서 가장 알고리즘 난이도가 높음. 필요시 그리디 배치는 최대 5명 제한이라 O(n²) 브루트포스로 충분 — 성능 최적화는 불필요.
