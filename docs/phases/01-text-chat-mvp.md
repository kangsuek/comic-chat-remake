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
