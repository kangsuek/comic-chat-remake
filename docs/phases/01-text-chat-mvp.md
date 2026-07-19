# Phase 1 — 텍스트 채팅 MVP

**목표**: 아바타/패널 없이, WebSocket 기반 텍스트 채팅이 동작하고 각 메시지에 감정 규칙 엔진이 붙어 감정 라벨이 표시되는 최소 앱을 만든다.

**데모 기준**: 브라우저 두 탭을 열고 서로 대화하면, 각 메시지 옆에 감지된 감정 라벨(예: `SHOUT(9)`, `HAPPY(10)`)이 실시간으로 표시된다.

## 선행 조건
- 없음 (첫 단계)

## 작업 목록

### 0. 리포지토리 셋업
- [ ] `pnpm init` + workspace 루트 설정 (`pnpm-workspace.yaml`: `packages/*`, `apps/*`, `tools/*`)
- [ ] 루트 `tsconfig.base.json`, ESLint/Prettier 공통 설정
- [ ] `packages/comic-engine` 패키지 스캐폴딩 (빈 `src/index.ts`, `package.json`, `tsconfig.json`)
- [ ] `packages/protocol` 패키지 스캐폴딩

### 1. 감정 규칙 엔진 포팅 (`packages/comic-engine/src/rules/`)
- [ ] `v1.0-pre/client/chat.rc`의 STRINGTABLE에서 `ID_RULE_*` 규칙 원문을 추출해 `rules.default.json`으로 옮긴다 (AllCaps/FindString/FindString*/CheckWord/CheckWord*/CheckStart/CheckStart* 전체)
- [ ] `matchers.ts`: `checkWord(text, substr)` (단어 경계 매칭), `findString(text, substr, caseSensitive)`, `checkStart(sentence, substr)` (문장 시작 매칭, `.!?` 분리), `checkAllCaps(text)` 구현 — `textpose.cpp`의 `CheckWord`/`GetNextSentenceStart` 로직을 그대로 포팅
- [ ] `ruleEngine.ts`: `loadRules(json)` → 규칙 등록, `resolveEmotion(text: string, rules: RuleSet): EmotionOpts` — `CEmotionOpts.Add()`의 우선순위 오버라이드 로직 포팅 (동일 emotion 값에 대해 더 높은 strength만 유지)
- [ ] 단위 테스트: STRINGTABLE 규칙표를 `(입력) → (기대 감정, 강도)` 테이블로 그대로 옮긴 테스트 작성 (`"LOL"` → LAUGH/11, `"YOU ARE GREAT"` → SHOUT/9 등 대문자 규칙과 중첩되는 케이스 포함)

### 2. 프로토콜 스키마 (`packages/protocol/src/`)
- [ ] `schema.ts`: zod로 클라이언트→서버 액션 최소 셋 정의 — `join { nick }`, `say { text }`
- [ ] 서버→클라이언트 브로드캐스트 최소 셋 — `historyEntry { type: "say", actorId, nick, text, emotion, ts }`, `memberList { members }`

### 3. WebSocket 서버 (`apps/server`)
- [ ] Node + `ws` (또는 `uWebSockets.js`는 과함, 순수 `ws` 라이브러리로 충분) 기본 서버 스캐폴딩
- [ ] 단일 room(하드코딩된 "lobby")에 대한 연결/닉네임 등록/브로드캐스트
- [ ] 메시지 수신 시 `comic-engine`의 `resolveEmotion()` 호출 → 결과를 `historyEntry`에 담아 전체 브로드캐스트
- [ ] 인메모리 이벤트 로그 배열 (SQLite는 Phase 3에서 도입 — 지금은 영속성 불필요)

### 4. 클라이언트 (`apps/web`)
- [ ] Vite + React + TS 스캐폴딩
- [ ] WS 연결 훅 (`useRoomConnection`), 닉네임 입력 화면
- [ ] 메시지 리스트 UI: 발신자, 텍스트, 감정 라벨 배지
- [ ] 입력창 → `say` 액션 전송

## 완료 조건 (Acceptance)
- [ ] 두 브라우저 탭에서 서로 다른 닉네임으로 접속해 대화 가능
- [ ] STRINGTABLE 규칙 테스트 스위트가 모두 통과
- [ ] 메시지 전송 후 100ms 이내에 감정 라벨이 표시됨 (로컬 네트워크 기준 체감 무지연)

## 리스크 / 메모
- 규칙 엔진의 우선순위 override 동작(`OVERRIDEBYPRIORITY` vs `ADDPRIORITY`)을 원작 그대로 재현할지, 단순화(항상 override)할지는 실제 테스트 케이스를 만들며 결정한다.

## 재검증 결과(2026-07-19, Phase 1~4 전체 재검증 중)

`textpose.cpp`(`CheckForUppers`/`CheckWord`/`GetNextSentenceStart`/`StartCompare2`/`GetEmotionsFromString`)와 `chat.rc`의 `ID_RULE_*` STRINGTABLE 원문을 한 줄씩 재대조했다. `rules.default.json`의 규칙 9개(SHOUT/LAUGH/HAPPY/SAD/POINTOTHER/POINTSELF/WAVE/COY, ANGRY·SCARED·BORED는 v1.0-pre에 정의 자체가 없어 비어있는 게 맞음)와 강도값 전부 원문과 정확히 일치. `checkWord`/`findString`/`checkStart`/`checkAllCaps`/`getSentenceStarts`/`addCandidate`(우선순위 override)도 전부 정확한 포팅으로 확인.

**단, 원작 자체의 실제 버그를 하나 발견했다 — 포팅 여부를 결정해야 함.** `GetEmotionsFromString`의 문장 시작 규칙(CheckStart 계열: WAVE의 Hi/Bye/Hello/Welcome/Howdy, POINTSELF의 I, POINTOTHER의 You) 검사 루프:

```c
const char *bptr = buff;
while (isspace(*bptr)) bptr++;
while (bptr && *bptr) {
    char *lptr = lower + (bptr - buff);   // 계산만 되고 아래에서 전혀 쓰이지 않음
    ...
    if (unit->caseSensitive) {
        if (StartCompare2(buff, unit->arg, unit->length))   // bptr이 아니라 buff(문자열 맨 앞) 고정
    } else if (StartCompare2(lower, unit->arg, unit->length))  // lptr이 아니라 lower(맨 앞) 고정
    ...
    bptr = GetNextSentenceStart(bptr);   // 다음 문장 시작으로 전진은 하지만 위 비교엔 반영 안 됨
}
```

`bptr`/`lptr`로 다음 문장 시작 위치를 정확히 계산해놓고도, 실제 `StartCompare2` 비교에는 이 위치를 전혀 쓰지 않고 매번 문자열 맨 앞(`buff`/`lower`)만 비교한다 — `lptr`은 계산만 되고 참조되지 않는 죽은 변수다. 결과적으로 원작은 **메시지의 첫 문장 시작(그것도 앞쪽 공백을 안 걸러낸 상태)만** 이 규칙들과 비교하고, 두 번째 이후 문장의 시작은 실질적으로 검사하지 않는다. 예: `"That's great. Hi there!"`는 원작에서 `Hi`가 두 번째 문장 시작인데도 WAVE가 매칭되지 않는다.

우리 포팅(`ruleEngine.ts`의 `resolveEmotion`)은 `getSentenceStarts()`로 구한 각 문장 시작 위치마다 실제로 슬라이스해서 검사하므로, 위 예시에서 WAVE가 정상적으로 매칭된다 — 원작의 버그를 재현하지 않고 "의도된 대로 동작하는" 버전으로 이미 구현되어 있다. `getSentenceStarts()` 자체가 계산하는 위치 목록은 원작의 `bptr` 전진 로직과 정확히 일치하므로(순수하게 그 목록을 실제로 활용하느냐만 다름), 원작 버그를 그대로 재현하려면 `resolveEmotion`의 문장 루프에서 슬라이스를 버리고 항상 위치 0만 검사하도록 바꾸면 된다.

이 프로젝트의 검증 전략(plan.md: "픽셀 단위 원작 재현은 목표가 아니다 — 동작/느낌의 재현이 목표")과, 지금까지 이 세션에서 확인된 다른 원작 버그 사례(예: `SM_SHOUT` 미구현 — 완전히 죽은 기능이라 "없는 그대로" 포팅)와는 성격이 다르다: 이번 건은 "기능은 살아있지만 의도대로 동작하지 않는" 케이스라 두 선택지 다 근거가 있다.

**결정(2026-07-19, 사용자 확인)**: 현재 상태(모든 문장 시작을 정상적으로 검사)를 유지한다. 원작 버그를 재현하지 않기로 확정 — "동작/느낌의 재현이 목표"라는 plan.md 원칙에 부합하고, 더 나은 사용자 경험을 준다는 점을 근거로 채택. 코드 변경 없음(이미 이 상태로 구현되어 있었음).
