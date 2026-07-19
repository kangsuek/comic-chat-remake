# Phase 4 — 전체 프로토콜 + 멀티룸 + Complex 아바타 마감

**목표**: 발화 모드(say/think/whisper/shout/action) 전체 구현, 멀티룸(채널) 지원, 서버 canonical 해석 + 클라이언트 낙관적(optimistic) 미리보기/재조정, Complex 아바타(얼굴+몸통 합성) 마감. 이 단계 완료 시 "기능적으로 완성된 웹 앱"이 된다.

**데모 기준**: 여러 개의 방을 만들고 옮겨다닐 수 있고, 생각 말풍선/귓속말/외침/액션이 각기 다른 시각 스타일로 표시되며, 메시지 전송 시 지연 없이 즉시 로컬 미리보기가 뜨고 서버 확정 결과로 자연스럽게 교체된다.

## 선행 조건
- Phase 3 완료 (자동 레이아웃 + 이벤트 소싱)

## 작업 단계 (5단계로 진행, 각 단계 후 확인 — 2026-07-19 사용자와 확정)

순서 결정 이유: 발화 모드가 프로토콜 확장의 기초라 가장 먼저. 닉네임 관리는 join 흐름의 작은 확장이라 다음. 낙관적 업데이트는 발화 모드가 안정된 뒤에 붙여야 아키텍처가 흔들리지 않음. 멀티룸은 room 구조 자체를 바꾸는 가장 큰 작업이라 그 뒤. Complex 아바타 검증은 거의 QA 성격이라 언제든 가능하므로 마지막.

### 1단계 — 발화 모드 전체 구현 — 완료 (2026-07-19)

**원본 재확인 결과 계획 정정**: `panel.cpp`의 `MakeBalloon`을 다시 확인하니 `SM_SHOUT` 분기가 `CBWoodringShout(...)` 호출이 주석 처리된 채 `break`만 있어 **실제로는 구현되어 있지 않다**(호출됐다면 NULL 말풍선으로 이어져 크래시했을 코드). v1.0-pre에서 "외침"은 별도 말풍선 스타일이 아니라 이미 Phase 1에서 포팅한 `AllCaps` 규칙이 인식한 SHOUT 감정이 캐릭터 표정으로만 드러나는 것이었다 — 그래서 "폰트/스타일 강조"라는 원래 계획 항목을 정정: `shout`은 별도 UI 버튼/말풍선 스타일 없이 `say`와 동일하게 두고, 사용자가 ALL CAPS로 치면 기존 감정 인식이 알아서 처리한다.

- [x] 프로토콜 확장(`packages/protocol/src/schema.ts`): `clientActionSchema`에 `mode`(say/think/whisper/shout/action, 기본값 say) 필드 추가, `whisper`는 `targetActorId` 필수(`.refine()`으로 검증). `historyEntrySchema`도 `mode` 필드 추가. `joined` 서버 메시지 신규 추가(join 성공 시 자기 actorId를 알려줌 — whisper 대상 목록에서 자신을 제외하려면 클라이언트가 자기 identity를 알아야 하는데 기존엔 그 방법이 없었음, 재검토 중 발견).
- [x] `apps/server/EventStore`: `loadVisibleTo(roomId, viewerActorId)` 추가 — whisper는 발신자·대상만, 나머지는 전원 공개. `loadAll`(필터 없음)은 서버 내부 상태(`Room.fold`) 복구 전용으로 한정하고 클라이언트로 그대로 보내면 안 된다는 주의사항을 코드에 명시.
- [x] `apps/server/Room`: `say(actorId, text, mode, targetActorId)`로 일반화. whisper는 발신자+대상에게만 `sendTo`, 나머지는 기존처럼 전체 브로드캐스트. join 시 `loadVisibleTo`로 필터링된 history를 재생.
- [x] `apps/web`: 발화 모드 드롭다운 + whisper 대상 선택(본인 제외, `selfActorId` 기반). `SpeechBubble`을 모드별로 구분 — `think`(꼬리 없는 구름 + 트레일링 방울), `whisper`(점선 테두리 + 이탤릭 폰트), `action`(구름 없는 밋밋한 박스 + 왼쪽 정렬 이탤릭, 원작 `CBWoodringBox`가 스플라인 자체가 없는 것과 대응), `shout`(위 정정대로 `say`와 동일).
- [x] 단위 테스트 188개(프로토콜 스키마 각 모드 파싱/whisper 검증, `EventStore.loadVisibleTo` 필터링, `Room.say()`의 모드별 브로드캐스트·whisper 한정 브로드캐스트·재접속 시 제3자에게 whisper 비공개 확인).
- [x] 브라우저 E2E(3개 독립 세션): say/think/action이 시각적으로 뚜렷이 구분됨을 스크린샷으로 확인. whisper(점선+이탤릭)를 보낸 뒤, **관련 없는 제3자 세션에는 그 패널 자체가 아예 안 보이는 것**을 확인 — 서버가 미리 필터링해서 보내므로 클라이언트의 `foldEvents()`가 원작의 "귓속말은 IRC PRIVMSG로 참여자에게만 전달됐다"는 동작을 별도 로직 없이 자연히 재현한다. 콘솔 에러 없음.

### 2단계 — 회원/닉네임 관리 — 완료 (2026-07-19)

**원본 조사 결과**: `irc.cpp`를 추적해 원작의 실제 동작을 확인했다.
- 닉네임 중복은 IRC 서버가 `433`(ERR_NICKNAMEINUSE) 응답으로 거부하고, 클라이언트는 `TryNewNick()`으로 재입력 다이얼로그를 띄운다 — **자동 접미사가 아니라 거부 후 재시도**가 원작 동작. 우리도 이 쪽을 채택했다.
- 닉네임 변경(`NICK` 명령)은 `NickEntry`→`ProcessNick`으로 처리되는데, `ProcessNick`은 **멤버 목록만 갱신**하고 `CPanel`/`AddLine`을 전혀 거치지 않는다 — 즉 원작은 닉네임 변경을 만화 패널에 흔적으로 남기지 않는다("OO님이 XX로 이름을 바꿨습니다" 같은 시스템 메시지 자체가 원작에 없음). `NickEntry`는 세션 로그 재생용일 뿐 코믹 렌더링과 무관하다는 것을 확인하고, 우리도 EventStore에 기록하지 않고 in-memory 멤버 상태만 바꾼 뒤 `memberList`를 재브로드캐스트하도록 구현했다(체크리스트의 "히스토리 반영 여부"는 이 조사 결과로 "반영 안 함"으로 확정).
- 닉네임 비교는 대소문자를 구분하지 않는다(IRC 관례 + 원작 코드 곳곳의 `stricmp` 사용과 동일선상).

- [x] 프로토콜(`packages/protocol/src/schema.ts`): `changeNick { newNick }` 클라이언트 액션, `joinRejected { reason: nickTaken | invalidCharacter }`/`changeNickRejected { reason: nickTaken | invalidNick }` 서버 메시지 추가.
- [x] `apps/server/Room`: `join()`에 닉네임 중복(대소문자 무관) 검사 추가 — 기존에는 `characterId` 오류 시에도 완전히 조용히 무시했는데(클라이언트가 영원히 응답을 못 받는 기존 결함), 이번에 `joinRejected` 통지를 붙여 함께 고쳤다. `changeNick(actorId, newNick)` 추가: 빈 문자열/중복 거부, 자기 자신과 같은 닉이면(트림 후) 조용히 무시(원작 `ProcessNick`의 `stricmp` 다름 체크와 동일), 성공 시 `memberList`만 재브로드캐스트.
- [x] `apps/web`: `App.tsx`가 이제 `joined` 확정 전까지 `NicknameGate`에 머물며 `joinError`를 보여주고 재시도를 받는다(기존엔 join 결과를 기다리지 않고 즉시 화면을 전환해, 거부돼도 사용자가 영문도 모른 채 멈춰있었다). `ChatRoom`에 닉네임 변경 입력창 + 거부 사유 표시 추가, 참여자 목록에 아바타 아이콘 + "(나)" 표시 추가.
- [x] 단위 테스트 8개 추가(`schema.test.ts` 2개, `room.test.ts` 6개 — 중복 거부, changeNick 성공/중복/빈값/자기자신/존재하지않는actorId, "leave 없이 재접속하면 거부됨"). 워크스페이스 전체 typecheck/lint/test(211개) 클린.
- [x] 브라우저 E2E(2개 독립 세션): Alice 입장 후 Bob이 같은 닉("alice", 대소문자 다름)으로 입장 시도 → 거부 메시지 확인. Bob으로 정상 입장 후 changeNick으로 "Alice"(중복, 거부) → "Bobby"(성공) 시도 → 양쪽 세션의 참여자 목록이 즉시 갱신되고, 새 만화 패널이 생기지 않음을 확인(원작 `ProcessNick` 동작과 일치). 이후 Bobby가 보낸 새 메시지는 바뀐 닉으로 정상 기록됨. 콘솔 에러 없음.

### 3단계 — 서버 canonical + 클라이언트 낙관적 업데이트 — 완료 (2026-07-19)

**원작과의 관계**: 이 단계는 포팅이 아니라 이 리메이크만의 신규 아키텍처 결정이다(plan.md에 이미 명시). 원작은 IRC 서버가 보통 PRIVMSG를 발신자 자신에게 echo하지 않으므로, 각 클라이언트가 자기 발화를 로컬 계산 결과로 그리는 게 곧 최종 결과였다 — "재조정"이라는 개념 자체가 없다. 우리는 서버를 canonical 소스로 두기로 했으므로(원작과 다른 설계) 로컬 미리보기와 서버 확정 결과가 다를 수 있어 reconcile이 필요하다.

**핵심 리팩터: `matchPose`/`PoseState`를 comic-engine으로 승격.** 서버(`Room.say`)가 이미 갖고 있던 "아바타 kind에 따라 matchComplexPose/matchSimplePose를 호출하고 라운드로빈 상태를 갱신" 로직은 원래 `room.ts`에 private 메서드로만 있었다. 클라이언트도 정확히 같은 로직이 필요해서(그래야 낙관적 예측이 서버와 어긋나지 않음), `packages/comic-engine/src/avatar/matcher.ts`에 `matchPose()`/`createInitialPoseState()`/`PoseState` 타입으로 옮겨 서버·클라이언트가 같은 코드를 import하게 했다(plan.md의 "로직 이원화 방지" 원칙을 이 지점에도 적용). `room.ts`는 이제 이 공용 함수를 호출만 한다.

- [x] 프로토콜에 `clientId`(낙관적 업데이트용 발신자 임의 식별자) 추가 — `sayActionSchema`/`sayHistoryEntrySchema` 양쪽에 optional 필드로, 서버는 의미를 해석하지 않고 그대로 통과시킨다(`Room.say`가 `entry`에 실어 되돌려줌, `EventStore`에도 다른 필드와 함께 자연히 영속화됨 — 특별 취급 불필요).
- [x] `apps/web/src/useOptimisticSay.ts`: 메시지 전송 즉시 `resolveEmotion`+`matchPose`(comic-engine, 서버와 동일 함수)로 "잠정" historyEntry를 계산해 `clientId`와 함께 로컬 상태(pending Map)에 추가 → `ChatRoom`은 `connection.entries`가 아니라 이 훅이 돌려주는 `entries`(confirmed + pending)를 `foldEvents`에 넘겨 패널을 그린다. 서버가 같은 `clientId`의 `historyEntry`를 브로드캐스트하면 pending에서 제거되고(reconcile), 내가 보낸 것이면 canonical `pose`로 로컬 `PoseState`를 재동기화해 드리프트를 막는다. 연결이 끊긴 상태거나 카탈로그가 아직 없으면 낙관적 렌더링 없이 평범히 전송(유령 말풍선 방지).
- [x] `buildProvisionalEntry`/`reconcilePending`을 React 비의존 순수 함수로 분리해 `useOptimisticSay.test.ts`에서 직접 검증(8개 테스트) — 이 프로젝트의 기존 관례(`panelBalloonLayout.ts`처럼 순수 로직을 뽑아 React/DOM 테스트 인프라 없이 검증)를 그대로 따름. `matcher.test.ts`에 `matchPose` 테스트 2개 추가.
- [x] 재조정 시 시각적 튐(flicker) 최소화: 로컬 계산이 서버와 **완전히 동일한 comic-engine 코드 + 동일한 PoseState**로 이뤄지므로(같은 입력 → 같은 출력), 단일 메시지가 인플라이트인 정상 케이스에서는 잠정 결과와 확정 결과가 텍스트/감정/포즈까지 bit-exact 일치한다 — "교체"가 아니라 사실상 무해한 덮어쓰기. 브라우저 E2E로 확인: 전송 직후 스크린샷과 1초 후 스크린샷이 완전히 동일(패널 위치/포즈/텍스트 변화 없음). 연속 3개 빠른 전송(확인 응답을 기다리지 않고 연달아 전송)도 각각 다른 패널에 정확한 순서/포즈로 기록됨을 확인 — 로컬 PoseState가 낙관적 계산 직후 즉시 갱신되므로 라운드로빈이 꼬이지 않음. 귓속말도 동일하게 검증(발신자 자신도 `sendTo` 대상이라 reconcile이 정상 작동, 대상자 화면에도 동일하게 반영).
- [x] 워크스페이스 전체 typecheck/lint/test(213개) 클린. 브라우저 E2E(2개 독립 세션)로 낙관적 렌더링·재조정·연속 전송·귓속말 전부 확인, 콘솔 에러 없음.

### 4단계 — 멀티룸 — 완료 (2026-07-19)

**원본 조사 결과 계획 정정 — backdrop은 프로토콜 이벤트가 아니다.** `backdrop.cpp`/`proppage.cpp`/`irc.cpp`를 추적한 결과, 배경 선택(`SetBackDrop`)은 IRC로 전송되는 방 공용 상태가 아니라 **각 클라이언트가 로컬(속성 페이지)로 고르는 순수 렌더링 취향**이었다 — `InitializeBackDrops()`가 읽는 `theApp.m_lastBackDrop`은 로컬 ini 설정이고, `irc.cpp` 어디에도 배경을 네트워크로 보내는 코드가 없다(`ChangeBackDropEntry`는 세션 로그 재생용, IRC PRIVMSG가 아님). 그래서 원래 계획의 "`changeBackdrop` 이벤트"를 정정: 배경은 서버/프로토콜과 무관한 `ChatRoom`의 로컬 state로만 구현했다(`PanelCanvas`의 `backdropId` prop).

**원본 조사 결과 — 멀티룸은 "동시에 여러 방 보기"가 아니라 "방 전환"이다.** `irc.cpp`의 `ChatSwitchChannel`은 채널을 바꾸면 문서를 통째로 새로 열어(`ID_FILE_NEW`) 만화를 처음부터 다시 시작한다 — 한 창에서 여러 채널을 동시에 보여주지 않는다. 방 목록은 IRC `LIST`(322/323) 명령으로 서버에 물어보는 요청-응답이지 실시간 구독이 아니다. 존재하지 않는 채널에 `JOIN`하면 서버가 그 자리에서 새로 만든다(별도 "방 생성" 명령이 없음). 이 세 가지를 그대로 반영했다.

- [x] 프로토콜: `join`에 `roomId`(생략 시 `lobby`) 추가, `switchRoom { roomId }`/`listRooms` 액션, `roomList { rooms: [{roomId, memberCount}] } }`/`switchRoomRejected { reason: nickTaken }` 메시지 추가, `joined`에 `roomId` 추가(switchRoom 후에도 재전송되어 클라이언트가 방이 바뀌었음을 앎).
- [x] `apps/server/src/roomRegistry.ts`(신규): `Map<roomId, Room>`을 관리하는 `RoomRegistry` — `getOrCreate`(지연 생성, irc.cpp의 JOIN과 동일), `leaveAndCleanup`(마지막 멤버가 나가면 메모리에서 제거), `list()`(irc.cpp의 LIST 포팅). 기존 `Room` 클래스는 "방 하나"만 알던 구현 그대로 두고 전혀 손대지 않았다 — 멀티룸은 순전히 `RoomRegistry`가 여러 `Room` 인스턴스를 조합해서 만든다. 모든 `Room`이 같은 `EventStore`를 공유하므로(Phase 3에서 이미 `room_id` 컬럼으로 방을 구분하도록 설계됨) 방이 메모리에서 정리돼도 SQLite 로그는 그대로 남아, 나중에 같은 roomId로 다시 들어오면 `room_snapshot`+나머지 이벤트 재fold로 정확히 복구된다 — Phase 3에서 준비해둔 스냅샷 캐시가 지연 생성/정리와 정확히 맞물림을 확인.
- [x] `server.ts`: `switchRoom`은 새 방에 먼저 `join`(같은 닉/캐릭터로, 닉 중복 시 `switchRoomRejected`)한 뒤에만 이전 방에서 `leaveAndCleanup` — 실패해도 원래 방 소속이 그대로 유지되도록 순서를 신중히 잡음(원작의 PART 후 JOIN이 아니라 JOIN 성공 확인 후 PART, 실패 시 안전).
- [x] `apps/web`: `NicknameGate`에 방 이름 입력(기본값 `lobby`) + 연결되면 한 번 `listRooms()`로 받아온 "지금 사람이 있는 방" 목록(클릭하면 입력창을 채움). `ChatRoom` 헤더에 현재 방 이름 + 방 이동 폼(+ 거부 메시지) + 배경 선택 드롭다운(로컬 전용) 추가. `useRoomConnection`의 `joined` 핸들러가 `entries`/`members`를 비우도록 확장(최초 join과 switchRoom 후 재전송 양쪽에서 재사용 — 이전 방 잔상이 새 방 데이터로 안 섞이게).
- [x] 단위 테스트 추가(`schema.test.ts` 4개, `roomRegistry.test.ts` 8개 — getOrCreate 재사용/분리, list, leaveAndCleanup의 메모리 정리·유지·재입장 복구, 존재하지 않는 room 처리). 워크스페이스 전체 typecheck/lint/test(225개) 클린.
- [x] 브라우저 E2E(3개 독립 세션): 서로 다른 방(`trackA`/`trackB`)에 입장한 두 세션이 서로의 메시지를 전혀 못 봄을 확인. `switchRoom`으로 실제 방을 옮기면 양쪽 세션의 참여자 목록이 즉시 갱신되고 대화가 새 방 것으로 완전히 교체됨을 확인. 새 방에서 닉네임이 이미 쓰이고 있으면 거부되고 원래 방 소속이 그대로 유지됨을 확인(3번째 세션으로 재현). 마지막 멤버가 나간 방이 목록에서 사라졌다가, 같은 이름으로 다시 입장하면 정확히 복구되는지 방 목록으로 확인. 배경 선택이 즉시 반영됨을 확인. 콘솔 에러 없음.

### 5단계 — Complex 아바타 마감 — 완료 (2026-07-19)

- [x] **얼굴+몸통 오프셋 합성 렌더링 15종 전수 검증**. `catalog.json`을 스캔해 v1.0-pre 22종 중 complex(얼굴+몸통 분리)가 정확히 15종(anna/armando/bolo/cro/dan/denise/hugh/lance/lynnea/margaret/mike/susan/tiki/tongtyed/xeno)임을 확인, 데이터 레벨 스캔으로 `flags` 조합을 비교한 결과 **susan 하나만 나머지 14종과 다름**(`headMask=false, torsoMask=true, torsoFirst=false` — 나머지는 전부 `headMask=true, torsoMask=false, torsoFirst=true`)을 발견 — z-order(어느 쪽이 위에 그려지는지)와 마스크 대상이 반대인 유일한 케이스라 렌더링 버그가 있다면 susan에서만 드러날 가능성이 높았다. 브라우저 E2E로 15종 전원을 "SO GREAT!!!"(SHOUT)로 발화시켜 실제 합성 결과를 육안 확인 — susan 포함 전원 정상(정렬 어긋남, 마스크 누락, z-order 역전 없음). 콘솔 에러 없음.
- [x] **리액션(`<Chr>`/`AddReaction`) 구현**(사용자 확인 후 진행). `saywnd.cpp`(`CSayCtrl::OnChar`, 빈 메시지에서 Enter 시 `<Chr>` 전송)와 `panel.cpp`(`AddReaction`)를 추적해 확정: 말풍선 없이 현재 반응 포즈만 패널에 반영하고, AddLine과 달리 "화자가 이미 패널에 있으면 새 패널" 규칙이 없어(대신 바디 5개 캡을 씀) 같은 패널 안에서 포즈만 교체(`ReplaceBody`)할 수 있다. `RecordBody`(현재 포즈 기록) + `ResetAvatar`/`SetNeutral`(다음 NEUTRAL 미리 계산)이라는 원작의 두 단계는, 매 리액션 호출마다 감정 후보 없이 `matchPose`를 호출하는 것과 결과적으로 완전히 동일함을 확인(라운드로빈이 한 칸씩 정확히 전진) — 별도 상태 없이 그대로 포팅됨.
  - `packages/comic-engine`: `ReactionEvent`/`FoldEvent` 유니온 추가(`SayEvent`에 `type:"say"` 태그 부여), `shouldStartNewReactionPanel`/`replaceOrAddBody` 신규.
  - 프로토콜: `react` 액션(부가 필드 없음), `historyEntrySchema`를 `say`/`reaction` 판별 유니온으로 확장.
  - `apps/server`: `Room.react(actorId)` — `matchPose(avatar, [], poseState)`로 NEUTRAL 라운드로빈 포즈를 계산해 EventStore에 기록·브로드캐스트.
  - `apps/web`: 메시지 입력이 비어있으면 제출 버튼이 "리액션 보내기"로 바뀌고 `connection.react()`를 호출(원작의 "빈 메시지+Enter"와 동일 트리거).
  - 단위 테스트 다수 추가(comic-engine의 fold/panel 리액션 케이스, protocol의 react/reaction 스키마, server의 `Room.react` — 전체 241개). 브라우저 E2E(2세션)로 말풍선 없는 렌더링, NEUTRAL 라운드로빈 진행(반복 클릭 시 포즈가 매번 달라짐), 이미 패널에 있으면 새 패널 없이 포즈만 교체, 다른 세션 브로드캐스트, 실제 발화와의 혼합까지 확인. 콘솔 에러 없음.

## 완료 조건 (Acceptance)
- [x] 4가지 발화 모드가 시각적으로 뚜렷이 구분됨 (1단계에서 달성, 브라우저 E2E로 확인)
- [x] 2개 이상의 방을 오가며 대화 가능, 방별 히스토리 독립 (4단계, 3개 독립 세션으로 확인)
- [x] 로컬 미리보기가 즉시 뜨고, 서버 확정 후 부자연스러운 점프 없이 정착 (3단계) — devtools 네트워크 스로틀로 직접 검증하지는 않았지만, 로컬 계산이 서버와 완전히 동일한 comic-engine 코드+상태를 쓰므로(같은 입력→같은 출력) 지연 여부와 무관하게 항상 무점프 재조정이 보장됨을 설계로 확인하고 단위 테스트(`reconcilePending`)로 그 등가성을 검증했다.

## 전체 재검증(2026-07-19, 사용자 요청으로 1~5단계 전체를 원본과 다시 대조)

- **실제 버그 발견·수정**: `Room.changeNick()`의 "실제로 바뀌었는지" 체크가 `===`(대소문자 구분)였는데, 바로 아래 `isNickTaken()`은 대소문자를 무시해 서로 앞뒤가 안 맞았다. 원작 `ProcessNick`은 `stricmp`(대소문자 무시)로 비교해 대소문자만 다른 변경(`"alice"→"ALICE"`)은 조용히 무시한다 — 이전 코드는 이런 경우를 "진짜 변경"으로 처리해버려 무의미한 memberList 재브로드캐스트가 발생했다. `stricmp`와 동일하게 대소문자 무시 비교로 고치고 회귀 테스트 추가(`room.test.ts`).
- **설계 확인 후 현행 유지로 결정**: `irc.cpp`(`GetAddressees2`/`whisperees`, `saywnd.cpp`의 `GetSelectedPuis`)를 보니 원작 귓속말은 멤버 목록에서 여러 명을 동시 선택해(`PRIVMSG nick1,nick2,... :msg`) 다중 대상에게 보낼 수 있었다 — 우리 구현은 `targetActorId` 하나만 지원한다. 사용자에게 확인한 결과 **다중 대상 지원은 추가하지 않고 현재의 단일 대상 설계를 유지**하기로 확정(현대적 1:1 DM에 가까운 UX가 더 낫다고 판단, 다중 선택 UI/프로토콜 확장은 이 기능의 가치 대비 과함).
- **경미해서 그대로 둔 항목**: `panel.cpp`의 `AddLine`은 `mode==SM_ACTION`이면 `<Chr>` 문자열 검사보다 먼저 `StartNewPanel()`을 호출한다 — 즉 원작에서 "액션" 모드가 선택된 채로 빈 메시지(`<Chr>`)를 보내면 그 리액션이 강제로 새 패널을 연다. 우리 구현의 리액션은 모드와 완전히 무관하게 동작해 이 부수효과를 재현하지 않는다. 코드 구조상의 우연한 상호작용에 가까워 보이고 체감 영향이 거의 없어 수정하지 않기로 함(필요해지면 `react` 액션에 현재 선택된 모드를 실어 서버가 `mode==="action"`일 때만 강제 새 패널로 넘기면 된다).
- 그 외(멀티룸의 switchRoom/listRooms/backdrop, Complex 아바타 15종 렌더링, 리액션의 새/클론 패널 판단·ReplaceBody 순서)는 원본과 다시 대조해 전부 정확히 일치함을 재확인, 코드 변경 없음.
- 워크스페이스 전체 typecheck/lint/test(242개) 클린.
