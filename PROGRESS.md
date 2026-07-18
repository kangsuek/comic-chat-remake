# 진행상황 (Progress Log)

전체 계획: [`plan.md`](plan.md) · 단계별 작업목록: [`docs/phases/`](docs/phases/)

이 파일은 작업이 진행될 때마다 갱신한다. 각 단계 항목의 상태는 `⬜ 시작 전 / 🟨 진행 중 / ✅ 완료 / ⛔ 보류`로 표기하고, 완료 시 날짜와 핵심 결과를 한 줄로 남긴다.

## 단계별 상태

| 단계 | 상태 | 시작일 | 완료일 | 비고 |
|---|---|---|---|---|
| [Phase 1 — 텍스트 채팅 MVP](docs/phases/01-text-chat-mvp.md) | ✅ 완료 | 2026-07-18 | 2026-07-18 | 감정 라벨 붙는 WS 텍스트 챗봇 + 타이핑 중 로컬 감정 미리보기, E2E 검증 완료 |
| [Phase 2 — 정적 아바타 렌더링](docs/phases/02-static-avatar-rendering.md) | ✅ 완료 | 2026-07-18 | 2026-07-18 | 22종 변환, Konva 렌더링, 캐릭터 선택 UI까지 E2E 검증 완료 |
| [Phase 3 — 완전 자동 레이아웃](docs/phases/03-full-auto-layout.md) | ⬜ 시작 전 | | | |
| [Phase 4 — 전체 프로토콜 + 멀티룸](docs/phases/04-full-protocol-multiroom.md) | ⬜ 시작 전 | | | |
| [Phase 5 — AI 캐릭터](docs/phases/05-ai-character.md) | ⬜ 시작 전 | | | |
| [Phase 6 — Tauri 빌드 + 마무리](docs/phases/06-tauri-packaging.md) | ⬜ 시작 전 | | | |

## 활동 로그 (최신순)

<!-- 새 항목은 이 줄 바로 아래에 추가 (최신이 위로) -->

- **2026-07-18** — Phase 2 전체 완료. `packages/comic-engine/src/avatar/bodyBox.ts`에 `GetBodyBox`(얼굴/몸통 상대위치+스케일+하단정렬) 포팅. `apps/web`에 `react-konva` 기반 `PanelCanvas`/`AvatarSprite`/`SpeechBubble` 구현, `NicknameGate`에 22개 캐릭터 아이콘 선택 UI 추가, `catalog.json` fetch 훅(`useAssetCatalog`) 작성. `apps/server`의 `Room`이 `matchComplexPose`/`matchSimplePose`로 액터별 포즈를 계산해 `historyEntry`에 포함하도록 확장(액터별 라운드로빈 상태 보관), `join` 프로토콜에 `characterId` 추가. 브라우저 2탭 E2E로 Complex(Mike, SHOUT/LAUGH 표정 전환)와 Simple(Tux, 전신 스프라이트) 렌더링, 배경(room8bs) 합성, 말풍선까지 전부 스크린샷으로 확인, 콘솔 에러 없음. 워크스페이스 전체 테스트 89개 + typecheck + lint 클린. `docs/phases/02`의 완료조건 중 "동일 감정 반복 시 라운드로빈" 항목은 원작 재확인 결과 잘못된 가정이었음을 밝히고 정정(라운드로빈은 NEUTRAL 폴백에서만 작동).
- **2026-07-18** — Phase 2 "포즈 매칭 엔진" 완료. `packages/comic-engine/src/avatar/`에 `emotionWheel.ts`(각도 유틸)와 `matcher.ts`(`matchComplexPose`/`matchSimplePose`) 작성. `avatar.cpp`를 재추적하다 중요한 설계 오류를 발견·수정: 원작의 실제 매칭 함수는 감정 후보 하나가 아니라 `resolveEmotion()`의 전체 후보 리스트를 우선순위 순으로 소비하며 얼굴/몸통을 각각 다른 후보로 채울 수 있음(SHOUT→얼굴, POINTOTHER→몸통처럼). 또한 라운드로빈은 매칭이 아니라 NEUTRAL 폴백에만 쓰인다는 것도 확인. `docs/phases/02-static-avatar-rendering.md`에 정정 근거 기록. 단위 테스트 16개 + 실제 Mike 매니페스트로 교차검증 완료.
- **2026-07-18** — Phase 2 `.avb` 컨버터(`tools/avb-converter`) 구현 및 실전 변환 완료. `bmpDecoder.ts`(1bpp/4bpp-RLE4), `avbParser.ts`(태그 스트림+ditto+감정 인덱스 매핑), `compositor.ts`(MERGEPAINT+SRCAND→알파합성, HEADMASK/TORSOMASK 게이팅), `manifest.ts` 작성. 새 공용 타입 패키지 `packages/asset-manifest-types` 추가. 22개 아바타 + 배경 3종 전량을 실제로 변환해 `apps/web/public/assets/`에 커밋(PNG 367개, 2.3MB). 구현 중 발견/수정한 실측 이슈 2건: (1) mask/aura가 fgnd와 원본 해상도가 다를 수 있음(원작이 `StretchDIBits`로 동일 목적지 사각형에 맞춰 그리기 때문) → 최근접 이웃 리샘플링으로 해결. (2) `avatario.cpp`의 `LoadAvatarInfo`가 내부 `AK_NAME` 태그를 버리고 `.avb` 파일명을 진짜 이름으로 쓴다는 사실을 재검증 중 발견(`glenda.avb`의 내부 이름은 "Greg") → 컨버터가 파일명을 채택하도록 수정. 매 단계 실제 원작 파일로 구현체를 직접 교차검증(헥스 수동 분석·22개 파일 전수 파싱·색상 배경에 합성해 육안 확인). 테스트 17개 통과.
- **2026-07-18** — Phase 2 착수, `.avb`/배경 BMP 포맷 스파이크 완료. `avatario.cpp`/`dib.cpp`/`bodycam.cpp`를 직접 추적하고 22개 아바타 `.avb` 전수 + 배경 3종 전수를 실제로 파싱·렌더링해 검증. 핵심 발견: (1) 캐릭터 아트는 전부 1bpp `BI_RGB` 비압축(RLE 불필요), 배경·아이콘만 4bpp `BI_RLE4`, `BI_RLE8`은 v1.0-pre에서 전혀 안 씀 — RLE8 디코더 구현 생략 결정. (2) 아바타 아트는 흑백 잉크선 라인아트이며 `MERGEPAINT`(mask/aura, 아바타별 `HEADMASK`/`TORSOMASK` 플래그로 게이팅)+`SRCAND`(fgnd) GDI 합성을 알파합성으로 치환하는 정확한 알고리즘 확정. (3) 얼굴+몸통 상대위치 계산식(`GetBodyBox`) 확보 — 자산에 굽지 않고 렌더러에 포팅하기로 결정. `plan.md`/`docs/phases/02-static-avatar-rendering.md`에 반영 완료.
- **2026-07-18** — 원작 소스 재검증 중 `ChatPreSendText`(`UI::PreSay`)의 "타이핑 중 실시간 반응" UX가 Phase 1 웹 클라이언트에 없음을 확인, 사용자 요청으로 즉시 추가. `apps/web/src/useLocalEmotionPreview.ts`가 `comic-engine`의 `resolveEmotion()`을 서버 왕복 없이 로컬에서 직접 호출해, 전송 전 입력창 옆에 감정 미리보기(`미리보기: LAUGH(11)` 등)를 표시. `claude-in-chrome`으로 전송 버튼을 누르기 전 미리보기가 뜨는 것과 전송 후 정리되는 것을 스크린샷으로 확인.
- **2026-07-18** — Phase 1 전체 완료. `apps/web`(Vite+React+TS)에 `useRoomConnection` 훅, 닉네임 입장 화면(`NicknameGate`), 메시지 리스트+감정 라벨 배지(`ChatRoom`) 구현. 서버+클라이언트를 실제로 띄워 `claude-in-chrome`으로 두 브라우저 탭 E2E 테스트 수행: 서로 다른 닉네임 입장 → memberList 실시간 동기화 → `ROTFL that's great :)`(LAUGH 11)/`THIS IS AMAZING`(SHOUT 9)/무매칭 문장(라벨 없음) 모두 두 탭에 동일하게 실시간 반영됨을 스크린샷으로 확인, 콘솔 에러 없음. 워크스페이스 전체 테스트 48개 + typecheck + lint 클린. Phase 1 완료 조건(두 탭 대화, STRINGTABLE 규칙 테스트 통과, 무지연 감정 라벨) 전부 충족.
- **2026-07-18** — Phase 1 "WebSocket 서버" 완료. `apps/server`(Node+ws)에 단일 room(`Room` 클래스: join/leave/say, 인메모리 이벤트 로그) 구현. `say()`가 `comic-engine`의 `resolveEmotion()`을 호출해 `historyEntry`로 브로드캐스트. 유닛 테스트 6개 + 실제 WS 연결로 두 클라이언트(join→memberList, say→historyEntry 동일 수신) 스모크 테스트 통과.
- **2026-07-18** — Phase 1 "프로토콜 스키마" 완료. `packages/protocol/src/schema.ts`에 zod로 클라→서버 `join`/`say` 액션과 서버→클라 `historyEntry`/`memberList` 브로드캐스트 정의. `emotion` 필드는 `comic-engine`의 `EmotionCandidate`(emotion/intensity/priority)와 `ALL_EMOTION_IDS`를 그대로 재사용해 타입 어긋남 방지. 테스트 8개 통과.
- **2026-07-18** — Phase 1 "감정 규칙 엔진 포팅" 완료. `packages/comic-engine/src/rules/`에 `matchers.ts`(checkWord/findString/checkStart/checkAllCaps/getSentenceStarts), `ruleEngine.ts`(loadRules/resolveEmotion), `rules.default.json`(v1.0-pre `chat.rc` STRINGTABLE ID_RULE_* 원문 이식) 작성. `textpose.cpp`/`avatar.h`와 대조 검증 완료(우선순위 override 처리 순서 버그 1건 테스트 작성 중 발견·수정). 단위 테스트 34개 통과.
- **2026-07-18** — Phase 1 "리포지토리 셋업" 완료. pnpm workspace, 루트 tsconfig/eslint/prettier, `packages/comic-engine`·`packages/protocol` 스캐폴딩.

- **2026-07-18** — 계획 수립 완료. 원작 소스(`comic-chat`) 분석 기반으로 `plan.md` 및 6단계 작업계획(`docs/phases/`) 작성. 구현 착수 전 상태.

## 다음 액션

- [ ] Phase 3("완전 자동 레이아웃")의 "0. 스파이크 — 패널 클론-확장 상태 모델"부터 착수(`docs/phases/03-full-auto-layout.md`)
