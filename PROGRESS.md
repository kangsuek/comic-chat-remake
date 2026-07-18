# 진행상황 (Progress Log)

전체 계획: [`plan.md`](plan.md) · 단계별 작업목록: [`docs/phases/`](docs/phases/)

이 파일은 작업이 진행될 때마다 갱신한다. 각 단계 항목의 상태는 `⬜ 시작 전 / 🟨 진행 중 / ✅ 완료 / ⛔ 보류`로 표기하고, 완료 시 날짜와 핵심 결과를 한 줄로 남긴다.

## 단계별 상태

| 단계 | 상태 | 시작일 | 완료일 | 비고 |
|---|---|---|---|---|
| [Phase 1 — 텍스트 채팅 MVP](docs/phases/01-text-chat-mvp.md) | ✅ 완료 | 2026-07-18 | 2026-07-18 | 감정 라벨 붙는 WS 텍스트 챗봇 + 타이핑 중 로컬 감정 미리보기, E2E 검증 완료 |
| [Phase 2 — 정적 아바타 렌더링](docs/phases/02-static-avatar-rendering.md) | ⬜ 시작 전 | | | |
| [Phase 3 — 완전 자동 레이아웃](docs/phases/03-full-auto-layout.md) | ⬜ 시작 전 | | | |
| [Phase 4 — 전체 프로토콜 + 멀티룸](docs/phases/04-full-protocol-multiroom.md) | ⬜ 시작 전 | | | |
| [Phase 5 — AI 캐릭터](docs/phases/05-ai-character.md) | ⬜ 시작 전 | | | |
| [Phase 6 — Tauri 빌드 + 마무리](docs/phases/06-tauri-packaging.md) | ⬜ 시작 전 | | | |

## 활동 로그 (최신순)

<!-- 새 항목은 이 줄 바로 아래에 추가 (최신이 위로) -->

- **2026-07-18** — 원작 소스 재검증 중 `ChatPreSendText`(`UI::PreSay`)의 "타이핑 중 실시간 반응" UX가 Phase 1 웹 클라이언트에 없음을 확인, 사용자 요청으로 즉시 추가. `apps/web/src/useLocalEmotionPreview.ts`가 `comic-engine`의 `resolveEmotion()`을 서버 왕복 없이 로컬에서 직접 호출해, 전송 전 입력창 옆에 감정 미리보기(`미리보기: LAUGH(11)` 등)를 표시. `claude-in-chrome`으로 전송 버튼을 누르기 전 미리보기가 뜨는 것과 전송 후 정리되는 것을 스크린샷으로 확인.
- **2026-07-18** — Phase 1 전체 완료. `apps/web`(Vite+React+TS)에 `useRoomConnection` 훅, 닉네임 입장 화면(`NicknameGate`), 메시지 리스트+감정 라벨 배지(`ChatRoom`) 구현. 서버+클라이언트를 실제로 띄워 `claude-in-chrome`으로 두 브라우저 탭 E2E 테스트 수행: 서로 다른 닉네임 입장 → memberList 실시간 동기화 → `ROTFL that's great :)`(LAUGH 11)/`THIS IS AMAZING`(SHOUT 9)/무매칭 문장(라벨 없음) 모두 두 탭에 동일하게 실시간 반영됨을 스크린샷으로 확인, 콘솔 에러 없음. 워크스페이스 전체 테스트 48개 + typecheck + lint 클린. Phase 1 완료 조건(두 탭 대화, STRINGTABLE 규칙 테스트 통과, 무지연 감정 라벨) 전부 충족.
- **2026-07-18** — Phase 1 "WebSocket 서버" 완료. `apps/server`(Node+ws)에 단일 room(`Room` 클래스: join/leave/say, 인메모리 이벤트 로그) 구현. `say()`가 `comic-engine`의 `resolveEmotion()`을 호출해 `historyEntry`로 브로드캐스트. 유닛 테스트 6개 + 실제 WS 연결로 두 클라이언트(join→memberList, say→historyEntry 동일 수신) 스모크 테스트 통과.
- **2026-07-18** — Phase 1 "프로토콜 스키마" 완료. `packages/protocol/src/schema.ts`에 zod로 클라→서버 `join`/`say` 액션과 서버→클라 `historyEntry`/`memberList` 브로드캐스트 정의. `emotion` 필드는 `comic-engine`의 `EmotionCandidate`(emotion/intensity/priority)와 `ALL_EMOTION_IDS`를 그대로 재사용해 타입 어긋남 방지. 테스트 8개 통과.
- **2026-07-18** — Phase 1 "감정 규칙 엔진 포팅" 완료. `packages/comic-engine/src/rules/`에 `matchers.ts`(checkWord/findString/checkStart/checkAllCaps/getSentenceStarts), `ruleEngine.ts`(loadRules/resolveEmotion), `rules.default.json`(v1.0-pre `chat.rc` STRINGTABLE ID_RULE_* 원문 이식) 작성. `textpose.cpp`/`avatar.h`와 대조 검증 완료(우선순위 override 처리 순서 버그 1건 테스트 작성 중 발견·수정). 단위 테스트 34개 통과.
- **2026-07-18** — Phase 1 "리포지토리 셋업" 완료. pnpm workspace, 루트 tsconfig/eslint/prettier, `packages/comic-engine`·`packages/protocol` 스캐폴딩.

- **2026-07-18** — 계획 수립 완료. 원작 소스(`comic-chat`) 분석 기반으로 `plan.md` 및 6단계 작업계획(`docs/phases/`) 작성. 구현 착수 전 상태.

## 다음 액션

- [ ] Phase 2("정적 아바타 렌더링")의 `.avb` 컨버터(`tools/avb-converter`) 스파이크부터 착수
