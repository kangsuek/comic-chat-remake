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

**2차 재검증(2026-07-19, 3단계 착수 전)** — `zoom.ts`의 `BodyBox.top`/`.bottom` 필드가 원작과 반대로 뒤바뀌어 있던 실제 버그를 발견해 수정했다. 원작 `SetBBox(left, bottom, right, top)` 호출(`b->SetBBox(xOffset, top[i]-height[i], xOffset+width[i], top[i])`)에서 `m_bbox.Top = top[i]`(키에 비례해 커지는 머리 쪽 값)이고 `m_bbox.Bottom = top[i]-height[i] = -unitHeight`(모든 몸이 공유하는 바닥, 상수)인데, 포팅 코드는 이 둘을 바꿔 넣고 있었다(`.top` 필드에 상수 바닥값을, `.bottom` 필드에 키 비례 값을 반환). 지금까지는 이 값을 실제로 소비하는 렌더러가 없어(Stage 3에서 처음 연결됨) 눈에 보이는 버그는 없었지만, 그대로 뒀다면 3단계에서 캐릭터가 위아래로 뒤집혀 그려질 뻔했다. 필드 계산과 반환값을 원작 방향에 맞게 정정하고, `top`이 `bottom`보다 항상 크다는(그리고 `bottom`이 `-unitHeight`로 고정된다는) 회귀 테스트를 추가했다(`zoom.test.ts`, 13번째 테스트).

**3차 재검증(2026-07-19, 사용자 요청으로 그리디 배치만 다시 정밀 대조)** — `placement.ts`를 `panel.cpp`의 `ComputeDisplacementPenalty`/`AddTalkTos`/`EvalPair`/`EvalPlacement`/`DoGreedyOrdering`/`UpdateHistoresis` 전체와 한 줄씩 재대조. 대부분 정확히 일치했지만 `EvalPair`의 talkTo 매칭에서 실제 불일치를 하나 발견해 고쳤다: 원작은 `av1->m_talkTo` 배열 전체를 순회하며 `b2ID`와 일치하는 **모든** 항목마다 페널티 블록을 반복 적용하는데(`for (i=0;i<nTalkTos;i++) if (av1->m_talkTo[i]==b2ID) { ...+= }`), 포팅 코드는 `.includes()`로 존재 여부만 한 번 확인해 매칭 시 페널티를 딱 한 번만 적용하고 있었다 — `talkTo`에 같은 대상이 중복으로 들어있는 경우에만 차이가 나는데, 지금은 프로토콜에 talkTo 필드가 아직 없어(Stage 2 완료 노트 참고, 항상 빈 배열) **현재는 도달 불가능한 코드 경로**라 실사용에 영향은 없다. 그래도 Phase 4에서 talkTo가 실제로 연결되면 어긋날 수 있어 원작과 동일하게 반복 합산하도록 수정하고, 중복 talkTo 항목에 대한 회귀 테스트를 추가했다(`placement.test.ts`, "talkTo에 같은 대상이 중복으로 들어있으면..."). `addTalkTos`의 중복 판정도 "현재까지 누적된 전체 목록" 기준으로 검사하는 원작 동작과 정확히 일치함을 재확인했다.

### 2단계 — 이벤트 소싱 백엔드 (`apps/server`) — 완료 (2026-07-19)
- [x] SQLite(`better-sqlite3`) `events(id, room_id, seq, ts, actor_id, type, payload_json)` append-only 테이블 (`apps/server/src/eventStore.ts`). WAL 모드, `UNIQUE(room_id, seq)`. `payload_json`에 `HistoryEntry` 원문(감정/포즈 등 이미 계산된 값 포함)을 그대로 저장해 replay 시 재계산이 필요 없다.
- [x] `foldEvents(events[]): FoldResult` — comic-engine 순수 함수(`packages/comic-engine/src/panel/fold.ts`, 서버/클라 공용). 1단계의 `shouldStartNewPanel`/`fetchSpeaker`/`doGreedyOrdering`/`updateHysteresis`를 그대로 재사용해 이벤트 로그를 패널 목록으로 fold. **스코프를 의도적으로 좁혔다**: 줌/픽셀 배치(`zoom.ts`)는 실제 자산 크기가 필요한 렌더링 시점 관심사라 3단계로 미뤘고, `AddTalkTos`(말을 건 상대 자동 합류)는 원작에서 아바타별 지속 선택 상태인데 현재 프로토콜에 addressing 필드가 아직 없어(항상 빈 배열) 지금 불러도 항상 no-op이므로 뺐다 — Phase 4에서 프로토콜에 talkTo가 추가되면 `speakers` 구성부에 이어붙이면 된다.
- [x] `room_snapshot(room_id, seq, state_json, updated_at)` 캐시 테이블(`apps/server/src/eventStore.ts`의 `saveSnapshot`/`loadSnapshot`). `Room.say()`가 매 이벤트마다 `foldEvents()` 결과를 그 시점 seq로 스냅샷 저장하고, 생성자는 스냅샷이 있으면 그 이후분(`loadSince(roomId, snapshot.seq)`)만 재fold한다 — 오래 지속된 방을 다시 열 때 이벤트 전체를 처음부터 재fold하지 않도록(멀티룸에서 room을 지연 생성/유휴 정리하게 될 Phase 4를 대비). "폭 변경 시 무효화"는 아직 구현하지 않았다 — `state_json`은 `foldEvents()`의 순수 출력(Panel[] + 히스테리시스)이고 아직 폭/줌 같은 렌더링 파라미터에 의존하지 않기 때문(줌은 3단계에서도 렌더 시점에만 계산될 예정, 아래 3단계 항목 참고). 그 의존성이 실제로 생기면 스냅샷에 입력 해시/버전을 같이 저장해 무효화하면 된다. 스냅샷이 실제로 fold의 시작점으로 쓰이는지(단순히 존재만 하고 무시되지 않는지)는 room.test.ts에서 "일부러 틀린 스냅샷"을 주입해 결과가 그 스냅샷을 기준으로 계산됨을 증명하는 테스트로 검증했다.
- [x] 재접속 시 이벤트 로그 replay로 상태 복구, `Room`을 이 위에 재구성(`apps/server/src/room.ts`). 생성자에서 스냅샷+나머지를 fold해 복구하고, 이후 `say()`마다 새 이벤트 하나씩 증분 fold(`foldEvents([event], previousFold)`)한다.
- [x] (체크리스트에 없었지만 이 단계의 실질적 목적을 위해 추가) 새 프로토콜 메시지 `history`(서버→클라, `entries: HistoryEntry[]`)를 `join` 직후 그 클라이언트에게만 전송 — 새로고침/재접속해도 이전 대화가 보이는 것이 이 Phase의 데모 기준(`데모 기준` 섹션 참고)이라 서버 영속화만으로는 부족했다. `apps/web`의 `useRoomConnection`도 이 메시지로 `entries` 초기값을 세팅하도록 수정.
- [x] 브라우저 E2E로 실제 재접속 replay 확인(두 차례): Alice로 2줄 발화(2패널 생성) → 페이지 새로고침 → 별도 신규 세션(Bob, 다른 캐릭터)으로 재입장 → 동일한 2패널이 그대로 재구성됨을 스크린샷으로 확인, 콘솔 에러 없음, `apps/server/data/events.db`에 실제 영속화 확인.

### 3단계 — 말풍선 랜덤화 + Konva 커스텀 모양 — 완료 (2026-07-19)
- [x] `estimateBalloonSize()`(`packages/comic-engine/src/balloon/layout.ts`) — `GetCloudEstimate` 포팅: 텍스트 폭이 `ONELINETHRESHOLD`(500) 이하면 그 폭 그대로(+200 fudge factor는 항상 적용), 넘으면 `area/potentialHeight` 기반 minWidth~maxWidth 사이 랜덤폭. `AreaEstimate`/`WidestWord`는 `text/textMetrics.ts`의 문자폭 근사(`estimateTextWidth`/`estimateWidestWordWidth`)로 대체.
- [x] X 위치 배치(원 체크리스트의 `positionBalloon`은 `estimateBalloonSize`에 통합) — arrowX를 항상 덮도록 `[arrowX-goalWidth, arrowX]` 범위에서 랜덤 배치 후 freeRect로 클램프. action(박스) 모드는 anchor 없이 freeRect 왼쪽 고정.
- [x] `layoutPanelBalloons()` — 단순화된 충돌 회피: 각 말풍선을 이전 말풍선들이 끝난 지점부터 순서대로 쌓아 애초에 같은 세로 구간을 재사용하지 않는다("겹치면 밀어낸다"의 동치 구현, route-region 기하 미포팅은 스파이크 결과에 이미 명시). 브라우저 E2E로 실제 확인(아래).
- [x] `splitTextToFit()`(`text/textMetrics.ts`) + `layoutPanelBalloons`의 `leftOver` 반환 — `CLabel::SplitHeight` 포팅: maxLines를 넘는 텍스트를 단어 경계에서 잘라 fitted/leftOver로 분리.
- [x] `SpeechBubble`(`apps/web/src/components/SpeechBubble.tsx`)을 `Konva.Shape`의 `sceneFunc` 커스텀 경로(오돌토돌한 구름 테두리 + 꼬리)로 교체.
- [x] `PanelCanvas`를 `HistoryEntry` 1:1 렌더링에서 `Panel`(다중 body+다중 balloon) 렌더링으로 재구성. `ChatRoom`이 클라이언트에서 직접 `foldEvents()`를 돌려(서버와 동일 로직 재사용, 프로토콜 변경 없음) 패널을 재구성. 아바타는 동일 폭 칸에 좌우 배치(정밀한 신장/줌 배치는 `zoom.ts` 실통합과 함께 후속 과제로 남김, 아래 "범위 밖" 참고).
- [x] 브라우저 E2E로 실제 다화자 패널 확인: 새로고침 후 접속한 신규 세션에서 4~5명이 한 패널에 모인 실제 대화 로그가 그대로 재생됨을 확인 — 캐릭터들이 좌우로 정확히 배치되고(순서/flip 반영), 말풍선 5개가 서로 겹치지 않고 세로로 쌓이며, 한글 2줄 문장도 올바르게 줄바꿈됨을 스크린샷으로 확인. 콘솔 에러 없음.

**재검증 중 발견해 고친 버그 2건**(Stage 3 착수 전 원본 재대조 + 실통합 중 발견):
1. `zoom.ts`의 `BodyBox.top`/`.bottom`이 원작과 반대로 뒤바뀌어 있었다. 원작 `SetBBox(left,bottom,right,top)` 호출에서 `m_bbox.Top=top[i]`(키에 비례)·`m_bbox.Bottom=-unitHeight`(상수)인데 포팅 코드는 이 둘을 바꿔 넣고 있었다 — 지금까지 소비하는 렌더러가 없어 눈에 보이는 버그는 없었으나 그대로 뒀다면 Stage 3에서 캐릭터가 위아래로 뒤집혔을 것. 필드 계산을 원작 방향으로 정정하고 회귀 테스트 추가(`zoom.test.ts`).
2. `fold.ts`가 `doGreedyOrdering`이 결정한 좌우 순서를 `panel.bodies` 배열에 반영하지 않고 있었다(flip만 패치, 배열 순서는 삽입 순서 그대로) — 렌더러가 배열 순서를 곧 화면 배치 순서로 쓰므로 실제 렌더링에서 순서가 어긋날 뻔했다. 4명이 순서대로 클론 합류하는 실제 시나리오로 재현(삽입순 `[a,b,c,d]` vs 실제 배치 `[d,c,a,b]`)해 회귀 테스트로 고정(`fold.test.ts`).

**의도적으로 범위 밖으로 남긴 것**: 아바타 배치는 지금 "동일 폭 칸에 좌우 나열"하는 단순 배치이며, 1단계에서 만든 `zoom.ts`의 신장 정규화/줌 스냅/정밀 `arrowX`(`GetDimInfo` 포팅 포함)는 아직 실제 렌더러에 연결하지 않았다 — 실제 자산 크기(포즈별 width/height/headHeight)를 매니페스트에서 뽑아 `BodyDim`으로 매핑하는 작업이 필요해 별도 과제로 분리했다. 또한 말풍선이 패널 하나에 다 안 들어가는 경우(레이아웃 예산 초과) 원작처럼 "새 패널로 재시도"하지 않고 캔버스를 세로로 늘려 전부 보여주는 방식으로 단순화했다(`leftOver`가 있으면 "+N자 더" 표시만) — `foldEvents`가 실제 말풍선 크기를 알지 못해 클론-vs-새패널 결정에 반영할 수 없기 때문. 이 두 가지(정밀 아바타 배치, 말풍선 적합성 기반 패널 재시도)는 Stage 4 또는 별도 후속 과제로 남긴다.

**사용자 피드백으로 발견·수정한 버그(2026-07-19)**: 실제로 채팅해보니 말풍선 크기가 내용 길이와 무관하게 거의 똑같아 보인다는 지적을 받았다. 원인은 `balloon/layout.ts`의 `DEFAULT_BALLOON_GEOMETRY`(`oneLineThreshold=500`, `widthFudge=200`, `minHookHeight=100`)가 원작의 ~2300-unit 패널 스케일에 맞춘 절대값인데, `PanelCanvas`는 그보다 훨씬 작은 스케일(`maxWidth≈284`)로 렌더링하면서 이 상수들을 그대로(스케일 조정 없이) 넘기고 있었던 것 — 특히 `widthFudge=200`이 `maxWidth`의 70%나 차지해 대부분의 짧은 메시지가 `len+200`으로 뭉개져 사실상 같은 폭에 클램프됐다. `PanelCanvas`에서 이 패널의 실제 폭 비율(원작 대비 약 0.13)로 스케일한 `geometry` 오버라이드(`oneLineThreshold=60`, `widthFudge=24`, `minHookHeight=12`, `padding=8`)를 `layoutPanelBalloons` 호출에 전달하도록 수정. 이 과정에서 처음엔 세로 예산(`BALLOON_AREA_BUDGET`)도 같은 비율로 줄였다가 5개 말풍선이 쌓이는 패널에서 뒤쪽 말풍선이 "+N자 더"로 잘리는 회귀를 만들었는데 — 짧은 텍스트 분기(`len<=oneLineThreshold`)는애초에 이 예산과 무관하고, 긴 텍스트 분기의 `minWidth`도 `estimateWidestWordWidth`로 바닥이 잡혀 있어 폭 균일화 버그와는 무관함을 재확인하고 예산은 넉넉한 값(700)으로 되돌렸다. 브라우저에서 길이가 다른 여러 메시지로 재확인해 폭이 뚜렷하게 달라지고 5개 말풍선 모두 잘리지 않고 표시됨을 확인.

### 4단계 — 시드 기반 재현성 + 전체 검증 — 완료 (2026-07-19)

**체크리스트를 실제 구현에 맞춰 재해석했다** — 착수 전 사용자와 확인한 내용:
- **배치 순서/방향(그리디 배치)과 줌은 애초에 랜덤이 아니다.** `doGreedyOrdering`/`updateHysteresis`/`layoutBodies`는 RNG를 전혀 쓰지 않는 순수 결정 함수(Stage 1에서 이미 확정·테스트됨) — 같은 이벤트 로그면 항상 같은 결과가 나오므로 애초에 "저장"이 필요 없다.
- **말풍선 폭/위치만 진짜 랜덤**(`estimateBalloonSize`의 `rng.next()`)인데, 이걸 이벤트 payload에 저장하는 원래 설계(원작의 `AddLine`이 `LayoutBalloons`를 인라인으로 호출해 그 자리에서 확정하는 것과 동일한 모델)로 가려면 서버가 패널 스케일(폭/폰트/여백 등, 지금은 `apps/web`에만 있음)을 알고 있어야 하고 프로토콜에 필드를 추가해야 한다 — 사용자에게 두 방식(①지금처럼 클라이언트가 매번 재계산하되 시드를 패널 **내용**에서만 유도해 항상 같은 값이 나오게 하기 vs ②서버가 1회 계산해 저장) 중 선택지를 제시했고, **①(현재 방식 유지)**로 확정했다.

- [x] (재해석) 패널 구조(순서/flip)·포즈가 이미 결정적임을 확인 — 별도 저장 불필요.
- [x] 말풍선 레이아웃의 "내용 기반 결정적 시드" 재현성을 순수 함수로 분리해 테스트로 증명 — `apps/web/src/panelBalloonLayout.ts`의 `computePanelBalloonLayout(panel)`(React/Konva 의존 없음)을 추출하고, 같은 내용의 `Panel`을 매번 새 객체로 구성해도(참조가 달라도) 결과가 항상 동일함을 테스트로 확인(`panelBalloonLayout.test.ts`, 4개). 이 작업을 하며 `apps/web`에 vitest를 처음 도입(다른 워크스페이스 패키지와 동일 버전).
- [x] 브라우저 E2E로 실제 새로고침(정확히는 완전히 새로운 세션으로 재접속 — 더 강한 검증: 같은 브라우저 캐시/상태가 아니라 독립된 두 세션이 같은 결과를 내는지) 확인: 같은 패널의 같은 말풍선을 두 번 캡처해 줌인 비교 — 말풍선 모양·크기·꼬리 위치가 픽셀 단위로 동일함을 확인. 콘솔 에러 없음.

**plan.md의 원래 설계 원칙("재계산 없이 저장된 값 사용")과의 차이를 명확히 기록**: 원래는 "한 번 계산해 저장, 이후 재계산 안 함"이었는데 실제로는 "매번 재계산하지만 내용이 같으면 항상 같은 값"으로 구현했다. 새로고침/재접속 시 동일하게 보인다는 사용자 체감 결과는 같지만, RNG 알고리즘이나 시드 유도 방식을 나중에 바꾸면 과거 패널들의 말풍선 모양이 전부 달라질 수 있다는 차이가 있다(원래 설계라면 그럴 일이 없음). 이 트레이드오프를 사용자에게 명시하고 승인받았다 — 서버 권위적 저장 모델은 프로토콜 확장 + 패널 스케일 설정 공유가 필요해 지금 범위 밖으로 남긴다.

## 완료 조건 (Acceptance)
- [x] 대화방에 여러 사람이 번갈아 말하면 한 패널에 모이고(클론), 같은 사람이 연속 말하면 새 패널이 시작됨이 시각적으로 확인됨(원작 실제 동작 — 위 스파이크 결과 참고) — 브라우저 E2E로 4~5명이 한 패널에 모이는 것까지 확인
- [ ] A가 B에게 말을 걸면(talkTo) B를 향해 캐릭터가 자동으로 방향을 바꿈 — **미달성, 의도적으로 범위 밖.** talkTo는 원작에서 아바타별 지속 선택 상태(UI)인데 현재 프로토콜에 addressing을 지정할 방법이 아직 없다(항상 빈 배열). Phase 4에서 발화 addressing이 프로토콜에 추가되면 `fold.ts`의 `speakers` 구성부에 이어붙이면 된다(Stage 2 완료 노트에 이미 기록).
- [x] 여러 말풍선이 겹치지 않고, 크기가 메시지마다 랜덤하게 다름 — 브라우저 E2E로 확인(길이가 다른 메시지들의 폭이 뚜렷이 다름, 5개 말풍선이 겹치지 않고 쌓임)
- [x] 브라우저 새로고침 후 서버에서 replay한 만화가 새로고침 전과 픽셀 단위는 아니어도 배치/포즈/텍스트가 동일함 — 실제로는 픽셀 단위까지 동일함을 확인(4단계 참고, 내용 기반 결정적 시드 덕분)

## 리스크 / 메모
- 이 단계가 전체 프로젝트에서 가장 알고리즘 난이도가 높음. 필요시 그리디 배치는 최대 5명 제한이라 O(n²) 브루트포스로 충분 — 성능 최적화는 불필요.
- 텍스트 폭 측정이 근사치이므로 말풍선 크기가 원작과 픽셀 단위로 다를 수 있음(비목표로 이미 합의됨).
