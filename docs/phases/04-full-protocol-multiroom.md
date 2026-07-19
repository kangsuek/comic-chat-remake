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

### 2단계 — 회원/닉네임 관리
- [ ] 닉네임 중복 처리(같은 방에 같은 닉네임 입장 거부 또는 자동 접미사)
- [ ] 닉네임 변경(`changeNick`) 액션 + 이벤트로 기록(히스토리에 "OO님이 XX로 이름을 바꿨습니다" 등 반영 여부 결정)
- [ ] 멤버 목록 UI 개선(아바타 아이콘 + 닉네임)

### 3단계 — 서버 canonical + 클라이언트 낙관적 업데이트
- [ ] 클라이언트: 메시지 전송 즉시 로컬에서 `resolveEmotion`+`matchPose`+`foldEvents`를 동일 `comic-engine`으로 실행 → "provisional" 패널 렌더링(임시 ID)
- [ ] 서버 브로드캐스트 도착 시 provisional 항목을 canonical 결과로 교체(reconcile)
- [ ] 재조정 시 시각적 튐(flicker) 최소화 검증(좌표/포즈가 사실상 대부분 같으므로 자연스러워야 함)

### 4단계 — 멀티룸
- [ ] `rooms` 맵으로 room 분리, room별 이벤트 로그·멤버 목록 독립. Phase 3에서 미리 준비해둔 `room_snapshot` 캐시가 room 지연 생성/정리와 실제로 맞물리는지 확인
- [ ] 방 생성/입장/나가기 UI + 프로토콜 액션
- [ ] room별 아바타 배경(backdrop) 선택(`changeBackdrop` 이벤트)

### 5단계 — Complex 아바타 마감
- [ ] 얼굴+몸통 오프셋 합성 렌더링을 실제 Complex 캐릭터(v1.0-pre 22종 중 복합형)로 전수 검증
- [ ] `DifferentTorso` 개념(몸짓만 바꾸는 리액션, 원작의 `<Chr>`/`AddReaction`) — "리액션만 보내기" UI 액션 추가(선택적)

## 완료 조건 (Acceptance)
- [ ] 4가지 발화 모드가 시각적으로 뚜렷이 구분됨
- [ ] 2개 이상의 방을 오가며 대화 가능, 방별 히스토리 독립
- [ ] 네트워크 지연을 인위적으로 늘려도(devtools throttle) 로컬 미리보기가 즉시 뜨고, 서버 확정 후 부자연스러운 점프 없이 정착
