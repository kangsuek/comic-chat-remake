# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

Microsoft Comic Chat(1996~98, MFC/C++)의 핵심 엔진 5가지를 분석해, **Web/macOS/Windows에서 동작하고 Claude Haiku가 상시 참여하는 AI 캐릭터를 갖춘 새 코믹 채팅 앱**으로 재설계하는 프로젝트다. 텍스트를 입력하면 감정을 자동 인식하고, 아바타 포즈를 매칭하고, 만화 패널을 자동 레이아웃해 채팅을 만화 형식으로 렌더링한다.

**현재 상태: 순수 계획 단계다.** 이 저장소에는 아직 소스 코드, `package.json`, git 저장소가 존재하지 않는다 (`plan.md`, `PROGRESS.md`, `docs/phases/*.md`만 있음). 구현을 시작할 때는 `docs/phases/01-text-chat-mvp.md`의 "리포지토리 셋업" 항목부터 착수한다. 빌드/린트/테스트 명령은 아직 존재하지 않으므로 지어내지 말 것 — 구현 후 이 파일에 실제 명령을 추가해야 한다.

## 문서 구조

- [`plan.md`](plan.md) — 전체 아키텍처 계획 (원작 분석 → 신규 설계 매핑, 시스템 아키텍처, 검증 전략). **작업 시작 전 반드시 정독.**
- [`PROGRESS.md`](PROGRESS.md) — 단계별 진행 상황 로그. 작업할 때마다 최신순으로 활동 로그를 추가하고 단계 상태(⬜/🟨/✅/⛔)를 갱신한다.
- [`docs/phases/01~06-*.md`](docs/phases/) — 단계별 세부 작업 목록·완료 조건(Acceptance)·리스크 메모. 각 단계는 독립적으로 데모 가능하도록 설계됨. 실제 작업은 이 파일들의 체크리스트를 따른다.
- 원본 분석 대상 소스: `/Users/kangsuek/pythonProject/comic-chat` (Microsoft Comic Chat 소스 아카이브, 이 저장소 밖에 위치) — 알고리즘을 포팅할 때 원본 로직 확인용으로 참조.

## 확정된 아키텍처 결정

- **크로스플랫폼**: 웹 앱(React+TS+Vite) 단일 코드베이스 + **Tauri**로 macOS/Windows 네이티브 래핑
- **채팅 백엔드**: IRC 호환 대신 **신규 WebSocket 백엔드**부터 구축. 서버가 방/멤버/메시지/레이아웃의 canonical 소스
- **아트 리소스**: 원작 `.avb`(아바타)/`.bgb`(배경) 바이너리를 파싱해 PNG+JSON으로 변환하는 오프라인 컨버터로 원본 아트 재사용
- **AI 참여 방식**: Claude Haiku가 상시 참여하는 AI 캐릭터로 동작 — 실제 WS 연결 없이 서버 내부에서 인간과 동일한 `handleSay()` 진입점을 호출해, 인간과 완전히 동일한 파이프라인(감정 인식→포즈 매칭→패널 배치)을 통과

## 계획된 모노레포 구조 (pnpm workspaces)

```
packages/
  comic-engine/         # 순수 TS: 규칙엔진, 포즈매칭, 패널레이아웃, 이벤트 fold (서버/클라 공용)
  protocol/              # zod 스키마: WS 메시지, HistoryEntry 이벤트 타입
  asset-manifest-types/  # 변환기 출력 JSON 매니페스트 공용 타입
apps/
  web/                   # Vite+React 클라이언트 (브라우저 단독 실행도 가능)
  server/                # Node WS 백엔드: 방/SQLite/AI 캐릭터 모듈
  desktop/               # Tauri(Rust) 셸 — apps/web dist를 감쌈
tools/
  avb-converter/         # Node+sharp: .avb/.bgb → PNG+JSON 오프라인 변환기
```

`comic-engine`은 부수효과 없는 순수 함수(`resolveEmotion`, `matchPose`, `layoutPanel`)만 export하며, **랜덤은 전부 주입된 시드 PRNG로 처리**한다(재현성 확보). 서버와 클라이언트가 워크스페이스 링크로 동일 버전의 동일 코드를 import하므로 로직이 이원화되지 않는 것이 핵심 설계 목표다.

## 핵심 설계 원칙 (원작 엔진 → 신규 구현 매핑)

1. **텍스트→감정 규칙 엔진** (`comic-engine/src/rules/textpose.ts`): 원작 STRINGTABLE 규칙(AllCaps/FindString/CheckWord/CheckStart 매처)을 JSON(`rules.json`)으로 분리해 그대로 포팅. **클라이언트에서 네트워크 지연 없이 동기 실행**되어야 함 — 이것이 원작의 "즉각 반응" 느낌의 핵심. LLM은 이 규칙 엔진을 대체하지 않는다.
2. **감정→아바타 포즈 매칭** (`comic-engine/src/avatar/matcher.ts`): 8방향 감정 원환(`2π/8` 간격) 위 각도거리+강도 최근접 탐색. `lastBody`/`lastFace` 라운드로빈으로 동일 감정 반복 선택 방지. Simple(단일 스프라이트)/Complex(얼굴+몸통 분리 합성) 두 아바타 종류 처리.
3. **패널 자동 레이아웃** (`comic-engine/src/panel/layout.ts`): 원작의 패널 클론/연속성 판단, 그리디 캐릭터 배치(방향/거리 페널티: 상대를 안 보면 +40, 거리비례 +4×거리), 히스테리시스(`lastRight/lastLeft/lastDir`), 줌 스냅(1.1배 미만 변화는 1.0 스냅)을 충실히 포팅. 단, 말풍선 **외곽선 스플라인 수식은 포팅하지 않고** 현대적 Canvas 곡선 경로로 재구현.
4. **WebSocket 프로토콜** (`packages/protocol/src/schema.ts`): IRC 호환 대신 서버가 canonical 소스. zod discriminated union으로 액션(`say/think/whisper/shout/action/changeAvatar/...`)과 브로드캐스트(`historyEntry`) 정의. 클라이언트는 전송 즉시 동일 로직을 로컬로 돌려 낙관적(optimistic) 미리보기를 보여주고, 서버 응답 도착 시 canonical 결과로 교체(reconcile).
5. **히스토리 재생(이벤트 소싱)**: SQLite(`better-sqlite3`)에 `events(room_id, seq, actor_id, type, payload_json)` append-only 로그. 방 상태는 항상 이 로그의 순수 fold(reduce)로 도출. **랜덤 결정 결과 자체를 이벤트 payload에 저장**(시드만 저장 후 재계산 X)해 replay가 항상 bit-exact 하도록 함.

## 렌더링

`react-konva`(Canvas2D) 사용. 얼굴+몸통 레이어 합성은 Konva `Group`/`Image`의 offset + `scaleX=-1` 미러링으로 처리. 말풍선+꼬리는 `Konva.Shape`의 커스텀 `sceneFunc`로 직접 그림. PixiJS(과스펙)/SVG(스프라이트 합성에 부자연스러움)는 기각됨.

## 자산 변환 파이프라인 (`tools/avb-converter`)

Node+`sharp` 기반. sharp가 RLE BMP를 지원하지 않으므로 `bmpDecoder.ts`에서 RLE4/RLE8 디코더를 직접 구현해야 한다. 1단계는 v1.0-pre의 비압축 포맷(캐릭터 22종, 배경 3종)만 대상으로 하고, v2.x의 태그/zlib압축/2bpp 팔레트 포맷은 Phase 6 스트레치 골로 미룬다.

## 검증 전략

- **규칙엔진**: STRINGTABLE 규칙을 그대로 옮긴 `(입력)→(기대 감정)` 테이블 테스트
- **포즈매칭**: 선택된 포즈가 `PI/8` 이내인지, 라운드로빈이 연속 반복하지 않는지 속성 기반 테스트
- **패널레이아웃**: 고정 시드로 스크립트된 이벤트 시퀀스 → 결과 JSON 골든파일 스냅샷 비교; `EvalPlacement` 스코어링 퍼징(예외/NaN만 체크)
- **WS 플로우**: 2개 클라이언트 스크립트 스모크 테스트, replay가 저장된 랜덤 결정과 함께 bit-exact한지 확인
- 픽셀 단위 원작 재현은 목표가 아니다 — 동작/느낌의 재현이 목표

## 선행 스파이크 필요 항목 (본 구현 전 검증)

1. BMP RLE4/RLE8 디코딩 + 마스크/아우라 합성 엣지케이스 — 실제 `.avb` 파일 2~3개로 먼저 검증
2. 말풍선 꼬리/route-region 충돌 기하 — 최소 프로토타입으로 눈으로 검증 후 본 엔진에 편입
3. 패널 클론-확장 상태관리 — 이벤트소싱 replay와 실시간 증분 업데이트가 동일 결과를 내는지 Phase 3 전에 검증

## 단계별 마일스톤

| 단계 | 데모 가능한 결과물 |
|---|---|
| [Phase 1](docs/phases/01-text-chat-mvp.md) | 감정 라벨이 붙는 동작하는 텍스트 챗봇 |
| [Phase 2](docs/phases/02-static-avatar-rendering.md) | 줄마다 아바타+말풍선 1개가 보이는 화면 |
| [Phase 3](docs/phases/03-full-auto-layout.md) | "Comic Chat처럼 보이는" 패널 자동 생성 (가장 알고리즘 난이도 높음) |
| [Phase 4](docs/phases/04-full-protocol-multiroom.md) | 기능적으로 완성된 웹 앱 (발화 모드 전체 + 멀티룸) |
| [Phase 5](docs/phases/05-ai-character.md) | Claude Haiku 캐릭터가 대화에 참여 |
| [Phase 6](docs/phases/06-tauri-packaging.md) | macOS/Windows 데스크톱 앱 배포 |

각 단계 착수 전 해당 `docs/phases/NN-*.md`의 작업 목록과 완료 조건을 확인하고, 완료 시 `PROGRESS.md`의 상태 테이블과 활동 로그를 갱신한다.

## 라이선스 메모

원본 저장소(`comic-chat`)는 MIT 라이선스이나 Microsoft 상표/브랜딩 유의사항이 있음 — 개인/취미 프로젝트로는 문제없으나, 공개 배포 시 "Comic Chat" 명칭·로고 사용은 피할 것.
