# Phase 3 — 완전 자동 레이아웃 (진짜 "코믹챗스러움")

**목표**: 원작의 핵심 매력인 패널 클론/연속성, 캐릭터 그리디 배치(방향/거리 페널티), 랜덤 말풍선 크기/위치, 줌 스냅을 포팅한다. 이벤트 소싱(HistoryEntry replay)을 백엔드의 근본 구조로 승격한다.

**데모 기준**: 여러 명이 대화하면 같은 장면이 이어질 때 패널이 이어붙고(클론), 대화 상대를 향해 캐릭터가 자동으로 배치/회전하며, 말풍선 크기가 매번 랜덤하게 다르지만 겹치지 않는다. 페이지를 새로고침해도(replay) 동일한 만화가 재구성된다.

## 선행 조건
- Phase 2 완료 (아바타 렌더링 파이프라인)

## 0. 스파이크 결과 (완료 — 2026-07-18, `panel.cpp`/`balloon.cpp` 정독)

`v1.0-pre/client/panel.cpp`(`AddLine`/`LayoutAvatars`/`LayoutBalloons`/`EvalPair`/`EvalPlacement`/`GetCloudEstimate` 등)와 `balloon.cpp`(`AreaEstimate`/`SetBBox`)를 직접 추적해 아래 내용을 확정했다. 상세 코드 근거는 각 함수명으로 원본 검색.

- **패널 클론 조건이 plan.md 초안과 반대였다.** `AddLine`의 실제 새 패널 강제 조건은 `mode==ACTION`, 현재 패널 요소≥5, 전체 패널 수<2, **또는 발화자가 이미 이 패널에 있음**(`AvatarInPanel`)이다. → **같은 화자가 연속 발화하면 새 패널이 시작되고, 클론(이어붙임)은 아직 이 패널에 없던 새 화자가 대화에 끼어들 때** 일어난다("여러 사람이 한 장면에 모이는" 패널). 클론 시 이전 패널은 `RemoveLastPanel()`+`delete`로 버려지고 클론본이 그 자리를 대체한다 — "확정된 패널은 불변, 교체될 뿐"이라는 스파이크 가정이 확인됨.
- **패널 생성 첫 2개는 "설정샷"이다.** `Establishing()`이 `panels.count<=1`이거나 `(방금 새로 만든 패널이 아니고) count<=2`일 때 true를 돌려주며, 이때 `LayoutAvatars`의 줌인 단계를 건너뛴다(캐릭터가 작게 나와 장면을 넓게 보여줌).
- **줌은 별도 함수가 아니라 `LayoutAvatars` 내부에** 있다: 신장 정규화 → 폭 초과 시 축소 → establishing이 아니면 `zoomFactor=min(unitWidth/sumWidth, maxBodyHeight/(maxHeadHeight*1.2))`로 확대(머리 안 잘림 보장) → **1.1배 미만이면 1.0으로 스냅**.
- **그리디 배치 상수 확정**(`EvalPair`): talkTo 없이 세상을 향해 말할 때 안 보면+4/상대가 안 보면+2; 특정 상대에게 말할 때 그쪽을 보면 +4×(거리-1), 안 보면 +40(중벌점), 상대가 날 안 보면 +4. `DoGreedyOrdering`은 화자를 하나씩 모든 삽입 위치×양방향에 넣어보며(`EvalPlacement`) 최저 페널티 채택, 동점이면 그 아바타의 `m_lastDir` 유지. `AddTalkTos`가 talkTo 대상을 최대 5명까지 자동으로 채워 넣는다. `UpdateHistoresis`가 배치 후 `m_lastDir`/`m_lastRight`/`m_lastLeft`를 갱신(다음 패널의 히스테리시스 페널티 기준이 됨).
- **말풍선 크기 추정에서 죽은 코드를 발견, plan.md 정정.** `GetCloudEstimate`의 `canBeTall` 분기는 `NoneToLeft()` 호출이 주석 처리되어 있어 **항상 TRUE** — "짧으면 1줄, 길면 1~3줄 랜덤"이라던 `else` 분기는 절대 실행되지 않는 죽은 코드다. 실제 라이브 동작: 텍스트 폭이 `ONELINETHRESHOLD`(500) 이하면 그대로 한 줄 폭, 초과하면 `potentialHeight`(이전 말풍선들 중 가장 낮은 하단 ~ 패널 하단)를 기준으로 `minWidth = area/potentialHeight`(최소 단어 폭 이상 보장)를 구하고, **`minWidth`~`maxWidth` 사이 랜덤 폭**을 목표로 삼는다. X 위치는 화자의 `arrowX`(머리/팔 근처 앵커) 기준 `[arrowX-goalWidth, arrowX]` 범위에서 랜덤 — 항상 arrowX를 말풍선이 덮도록 보장.
- **route-region(꼬리 경로) 충돌 회피는 계획대로 포팅하지 않는다.** `GetInterveningBBox`/`Dock`/`AdjustRouteRgns`는 스플라인 좌표계에 강하게 결합된 복잡한 기하 로직이라, 더 단순한 "이전 말풍선들과 겹치면 아래로/옆으로 밀어내는" 현대적 충돌 회피로 재구현한다(원작 느낌 재현이 목표, 픽셀 동일 재현은 비목표 — plan.md에 이미 명시됨).
- **텍스트 폭 측정**: 원작은 실제 GDI `GetTextExtent`(폰트 메트릭)를 쓰지만, 서버에는 DOM/Canvas가 없다. 문자 수 기반 근사 폭 추정으로 대체한다(Phase 1/2에서 이미 쓰던 방식과 동일선상).
- **시드/랜덤 모델**: 원작은 레이아웃 결정(`AddLine` 시점, `randfloat()`)과 그리기(`Draw` 시점, `srand(m_seed)`)가 분리되어 있고 레이아웃 자체는 전역 `rand()` 스트림에 의존한다 — 재현성이 필요한 건 우리 쪽 요구사항(새로고침 후 replay)이지 원작 그대로 포팅할 메커니즘이 아니다. **우리는 이벤트별로 결정을 한 번 계산해 이벤트 payload에 저장하고, replay는 재계산 없이 저장된 값을 그대로 fold한다**(plan.md의 기존 설계 그대로, 원작 rand()/srand() 알고리즘을 흉내 낼 필요 없음).

## 작업 단계 (4단계로 진행, 각 단계 후 확인)

### 1단계 — 패널 클론/그리디 배치/줌 (`packages/comic-engine/src/panel/`) — 완료 (2026-07-19)
- [x] `shouldStartNewPanel(currentPanel, speakerId, mode, totalPanelCount): boolean` — 위에서 확정한 5개 조건 포팅 (`panel.ts`)
- [x] `clonePanel(panel): Panel` — bodies + balloons 깊은 복사. actorId 문자열 참조 설계 덕에 원작의 "speaker 포인터 재연결" 문제 자체가 없어져 `structuredClone`으로 충분 (`types.ts`)
- [x] `addTalkTos()`/`evalPair()`/`evalPlacement()`/`doGreedyOrdering()`/`updateHysteresis()` — 확정된 상수·알고리즘 그대로 포팅, `m_priority`는 죽은 필드로 확인되어 미포팅 (`placement.ts`)
- [x] `computeZoom()` → `layoutBodies()` + `isEstablishing(panelCount, justCreatedNewPanel)` — `LayoutAvatars`의 신장 정규화/축소/확대/1.1배 스냅/마진 배치 로직 분리 포팅. `AdjustArtToCoord`(패널 카메라 뷰포트 이동)는 렌더링 계층 관심사로 판단해 미포팅 — Stage 3에서 필요시 별도 처리 (`zoom.ts`)
- [x] 단위 테스트 84개 전부 통과 (`panel.test.ts` 9, `placement.test.ts` 9, `zoom.test.ts` 12 — zoom 스냅 경계값 1.09/1.10/1.11배 포함). talkTo 그래프 퍼징·골든파일 스냅샷은 Stage 2(이벤트 소싱)와 결합해 Stage 4에서 다룬다.

**재검증 결과(2026-07-19)** — `panel.cpp`(`FetchSpeaker`/`ReplaceBody`/`AvatarInPanel`/`AddTalkTos`/`ComputeDisplacementPenalty`/`DoGreedyOrdering`/`UpdateHistoresis`)와 `avatar.cpp`(`GetDimInfo`)를 라인 단위로 재대조. 알고리즘 자체는 전부 일치 확인, 통합 시 놓치기 쉬운 세부사항 3건을 코드 주석으로 보강:
- `zoomIn`은 원작이 `#define zoomIn TRUE`(SIGGRAPH 데모 빌드에서만 FALSE)인 컴파일타임 상수 — 실질 조건은 사실상 `!establishing`뿐. `zoom.ts`의 `ZoomLayoutInput.zoomIn`에 주석으로 명시(향후 사용자 설정 여지는 남기되, 원작 재현 시 항상 true).
- `normHeight`는 `GetDimInfo`가 Simple/Complex 두 아바타 타입 모두에서 100으로 하드코딩(`rec->normHeight`는 주석 처리된 죽은 필드) — "캐릭터별 키 차이"가 실제로는 반영되지 않는다. `zoom.ts`의 `BodyDim.normHeight`에 주석 추가.
- `arrowX` 계산 순서 의존성 발견: 원작은 `DoGreedyOrdering`이 `m_flip`을 먼저 확정한 뒤 `GetDimInfo`를 호출해 arrowX를 구한다(미러링되면 anchor x위치도 반전). Stage 2/3 통합 시 반드시 `doGreedyOrdering()`의 flip 결과를 먼저 얻은 뒤 `arrowXRatio`를 계산해 `layoutBodies()`에 넘겨야 함 — `zoom.ts`의 `BodyDim.arrowXRatio`에 주석으로 명시.
- 그 외 확인: `UpdateHistoresis`는 배치 끝(맨 왼쪽/오른쪽)에 있는 아바타의 반대쪽 이웃 값을 리셋하지 않고 이전 값을 그대로 남겨두는데(`placement.ts`의 `updateHysteresis`가 이미 이 동작을 정확히 재현), `DoGreedyOrdering`의 매직넘버 `bestRating=1000` 대신 `Infinity`를 쓴 것은 벤치마크상 안전한 의도적 개선(현실적 입력에서 1000을 넘는 rating이 나올 수 있어 더 견고함).

### 2단계 — 이벤트 소싱 백엔드 (`apps/server`) — 완료 (2026-07-19)
- [x] SQLite(`better-sqlite3`) `events(id, room_id, seq, ts, actor_id, type, payload_json)` append-only 테이블 (`apps/server/src/eventStore.ts`). WAL 모드, `UNIQUE(room_id, seq)`. `payload_json`에 `HistoryEntry` 원문(감정/포즈 등 이미 계산된 값 포함)을 그대로 저장해 replay 시 재계산이 필요 없다.
- [x] `foldEvents(events[]): FoldResult` — comic-engine 순수 함수(`packages/comic-engine/src/panel/fold.ts`, 서버/클라 공용). 1단계의 `shouldStartNewPanel`/`fetchSpeaker`/`doGreedyOrdering`/`updateHysteresis`를 그대로 재사용해 이벤트 로그를 패널 목록으로 fold. **스코프를 의도적으로 좁혔다**: 줌/픽셀 배치(`zoom.ts`)는 실제 자산 크기가 필요한 렌더링 시점 관심사라 3단계로 미뤘고, `AddTalkTos`(말을 건 상대 자동 합류)는 원작에서 아바타별 지속 선택 상태인데 현재 프로토콜에 addressing 필드가 아직 없어(항상 빈 배열) 지금 불러도 항상 no-op이므로 뺐다 — Phase 4에서 프로토콜에 talkTo가 추가되면 `speakers` 구성부에 이어붙이면 된다.
- [x] `room_snapshot(room_id, seq, state_json, updated_at)` 캐시 테이블(`apps/server/src/eventStore.ts`의 `saveSnapshot`/`loadSnapshot`). `Room.say()`가 매 이벤트마다 `foldEvents()` 결과를 그 시점 seq로 스냅샷 저장하고, 생성자는 스냅샷이 있으면 그 이후분(`loadSince(roomId, snapshot.seq)`)만 재fold한다 — 오래 지속된 방을 다시 열 때 이벤트 전체를 처음부터 재fold하지 않도록(멀티룸에서 room을 지연 생성/유휴 정리하게 될 Phase 4를 대비). "폭 변경 시 무효화"는 아직 구현하지 않았다 — `state_json`은 `foldEvents()`의 순수 출력(Panel[] + 히스테리시스)이고 아직 폭/줌 같은 렌더링 파라미터에 의존하지 않기 때문(줌은 3단계에서도 렌더 시점에만 계산될 예정, 아래 3단계 항목 참고). 그 의존성이 실제로 생기면 스냅샷에 입력 해시/버전을 같이 저장해 무효화하면 된다. 스냅샷이 실제로 fold의 시작점으로 쓰이는지(단순히 존재만 하고 무시되지 않는지)는 room.test.ts에서 "일부러 틀린 스냅샷"을 주입해 결과가 그 스냅샷을 기준으로 계산됨을 증명하는 테스트로 검증했다.
- [x] 재접속 시 이벤트 로그 replay로 상태 복구, `Room`을 이 위에 재구성(`apps/server/src/room.ts`). 생성자에서 스냅샷+나머지를 fold해 복구하고, 이후 `say()`마다 새 이벤트 하나씩 증분 fold(`foldEvents([event], previousFold)`)한다.
- [x] (체크리스트에 없었지만 이 단계의 실질적 목적을 위해 추가) 새 프로토콜 메시지 `history`(서버→클라, `entries: HistoryEntry[]`)를 `join` 직후 그 클라이언트에게만 전송 — 새로고침/재접속해도 이전 대화가 보이는 것이 이 Phase의 데모 기준(`데모 기준` 섹션 참고)이라 서버 영속화만으로는 부족했다. `apps/web`의 `useRoomConnection`도 이 메시지로 `entries` 초기값을 세팅하도록 수정.
- [x] 브라우저 E2E로 실제 재접속 replay 확인(두 차례): Alice로 2줄 발화(2패널 생성) → 페이지 새로고침 → 별도 신규 세션(Bob, 다른 캐릭터)으로 재입장 → 동일한 2패널이 그대로 재구성됨을 스크린샷으로 확인, 콘솔 에러 없음, `apps/server/data/events.db`에 실제 영속화 확인.

### 3단계 — 말풍선 랜덤화 + Konva 커스텀 모양
- [ ] `estimateBalloonSize(text, freeRect, rng)` — 문자 수 기반 폭 근사 + 확정된 랜덤 공식(짧으면 고정, 길면 minWidth~maxWidth 랜덤)
- [ ] `positionBalloon(anchorX, goalWidth, freeRect, rng)` — arrowX 기준 랜덤 배치 + 클램프
- [ ] 단순화된 충돌 회피(겹치면 아래로 밀기) 프로토타입 → 여러 화자 패널로 육안 검증
- [ ] 말풍선이 안 들어가면 텍스트 강제 분할 + 다음 패널로 이어붙임(`leftOver`)
- [ ] `SpeechBubble`을 `Konva.Shape`의 `sceneFunc` 커스텀 경로(둥근 구름 테두리 + 꼬리)로 교체

### 4단계 — 시드 기반 재현성 + 전체 검증
- [ ] 이벤트 payload에 랜덤 결정 결과(말풍선 폭/위치, 줌 값, 배치 순서/방향) 저장
- [ ] replay가 저장된 값을 그대로 사용(재계산 없음)함을 테스트로 증명
- [ ] 브라우저 새로고침 E2E로 이벤트소싱 replay가 새로고침 전과 동일한 배치/포즈/텍스트를 만드는지 확인

## 완료 조건 (Acceptance)
- [ ] 대화방에 여러 사람이 번갈아 말하면 한 패널에 모이고(클론), 같은 사람이 연속 말하면 새 패널이 시작됨이 시각적으로 확인됨(원작 실제 동작 — 위 스파이크 결과 참고)
- [ ] A가 B에게 말을 걸면(talkTo) B를 향해 캐릭터가 자동으로 방향을 바꿈
- [ ] 여러 말풍선이 겹치지 않고, 크기가 메시지마다 랜덤하게 다름
- [ ] 브라우저 새로고침 후 서버에서 replay한 만화가 새로고침 전과 픽셀 단위는 아니어도 배치/포즈/텍스트가 동일함 (JSON 비교로 검증)

## 리스크 / 메모
- 이 단계가 전체 프로젝트에서 가장 알고리즘 난이도가 높음. 필요시 그리디 배치는 최대 5명 제한이라 O(n²) 브루트포스로 충분 — 성능 최적화는 불필요.
- 텍스트 폭 측정이 근사치이므로 말풍선 크기가 원작과 픽셀 단위로 다를 수 있음(비목표로 이미 합의됨).
