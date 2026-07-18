# Comic Chat 리부트 — Web/macOS/Windows + Claude Haiku AI 캐릭터 참여형 코믹 채팅 앱

> 원본 분석 대상: `/Users/kangsuek/pythonProject/comic-chat` (Microsoft Comic Chat 소스 아카이브, 1996~98)
> 이 문서는 원작의 핵심 엔진 1~5를 분석해 새 애플리케이션으로 재설계한 전체 계획이다.
> 단계별 세부 작업은 [`docs/phases/`](docs/phases/), 진행상황은 [`PROGRESS.md`](PROGRESS.md) 참고.

## Context (배경 및 목표)

Microsoft Comic Chat(1996~98, MFC/C++)의 소스를 분석한 결과, 핵심은 5가지 엔진으로 요약된다:

1. **텍스트→감정 규칙 엔진** (`textpose.cpp`/`semantic.cpp`) — 정규식 유사 패턴 매칭으로 메시지에서 감정/제스처를 즉시 추론
2. **감정→아바타 포즈 매칭** (`avatar.cpp`) — 8방향 감정 원환(wheel) 위에서 최근접 포즈를 찾아 선택
3. **패널 자동 레이아웃** (`panel.cpp`) — 캐릭터 배치(그리디 조합 최적화)와 말풍선 배치(실패 시 백트래킹)를 자동화
4. **IRC 프로토콜 계층** (`irc.cpp`/`chatprot.h`) — 표준 IRC 텍스트에 감정 메타데이터를 몰래 인코딩해 하위호환 유지
5. **히스토리 재생 시스템** (`histent.h`) — 커맨드 패턴 이벤트 로그로 전체 만화를 언제든 재생성

이 자산(알고리즘 설계 + 원본 캐릭터 아트)을 재사용해, **Web / macOS / Windows에서 동작하고 Claude Haiku가 상시 참여하는 AI 캐릭터를 갖춘 새 코믹 채팅 앱**을 만드는 것이 목표다. 사용자와 확정한 4가지 아키텍처 결정:

- **크로스플랫폼**: 웹 앱(React+TS+Vite) 단일 코드베이스 + **Tauri**로 macOS/Windows 네이티브 래핑
- **채팅 백엔드**: IRC 호환 대신 **신규 WebSocket 백엔드**를 처음부터 구축 (서버가 방/멤버/메시지/레이아웃의 canonical 소스)
- **아트 리소스**: 원작 `.avb`(아바타)/`.bgb`(배경) 바이너리를 파싱해 PNG+JSON으로 변환하는 오프라인 컨버터로 **원본 아트 재사용**
- **AI 참여 방식**: Claude Haiku가 **상시 참여하는 AI 캐릭터**로 동작 — 다른 인간 참여자와 동일한 파이프라인(감정 인식→포즈 매칭→패널 배치)을 통과해 렌더링됨

---

## 원작 기능 1~5 분석 → 신규 설계 매핑

### 1. 텍스트→감정 규칙 엔진 → `comic-engine`의 `resolveEmotion()`

**원작 분석**: `chat.rc`의 STRINGTABLE에 `Function("arg");strength` 형태로 규칙이 저장되고, 시작 시 파싱되어 4종 매처(`AllCaps`, `FindString`/`FindString*`, `CheckWord`/`CheckWord*`, `CheckStart`/`CheckStart*`)로 등록된다. 예: 전체 대문자·`"!!!"` → SHOUT(9), `"ROTFL"/"LOL"` → LAUGH(11), `":)"` → HAPPY(10), 문장이 `"You"`/`"are you"`로 시작 → POINTOTHER(4~8), `"Hi"/"Bye"/"Hello"` 시작 → WAVE. 매칭 결과는 `CEmotionOpts`(최대 10슬롯)에 emotion별로 누적되며, 우선순위(strength)가 가장 높은 값이 최종 채택된다.

**신규 설계**: `packages/comic-engine/src/rules/textpose.ts`에 순수 함수로 1:1 포팅. 규칙 테이블은 하드코딩 대신 JSON(`rules.json`)으로 분리해 확장 가능하게 한다. **네트워크 지연 없이 클라이언트에서 동기 실행**되어야 한다는 원작의 설계 목표를 유지 — 이것이 "타이핑하자마자 캐릭터가 즉시 반응하는" 느낌의 핵심이다. LLM은 이 엔진을 대체하지 않는다(감정 인식 자체는 규칙 엔진 유지 — 지연 없는 반응성이 원작 재현의 핵심 가치).

### 2. 감정→아바타 포즈 매칭 → `comic-engine`의 `matchPose()`

**원작 분석**: 8개 감정이 원환(`2π/8` 간격: HAPPY→COY→BORED→SCARED→SAD→ANGRY→SHOUT→LAUGH)에 배치되고, WAVE/POINTOTHER/POINTSELF 등은 별도 특수 제스처로 원환 밖에 존재. 캐릭터는 얼굴+몸통 분리 합성형(`CAvatarComplex`)과 단일 스프라이트형(`CAvatarSimple`) 두 종류. 매칭은 각도 거리 `PI/8` 이내 후보 중 강도(intensity) 차이가 가장 작은 포즈를 선택하고, `m_lastBody`/`m_lastFace` 라운드로빈으로 동일 감정이 반복 선택되는 것을 방지(시각적 다양성).

**신규 설계**: `packages/comic-engine/src/avatar/matcher.ts`에 각도거리+강도 최근접 탐색과 라운드로빈 상태를 그대로 포팅. 데이터는 "자산 변환 파이프라인"이 만드는 JSON 매니페스트(`poseId, emotion, intensity, imagePath, faceX/xCX/...`)를 입력으로 받는다. 렌더러는 `part: "face"/"torso"`를 오프셋에 맞춰 레이어 합성(Complex) 또는 단일 이미지 배치(Simple)로 그린다.

### 3. 패널 자동 레이아웃 → `comic-engine`의 `layoutPanel()`

**원작 분석**:
- **새 패널 여부**: 강제(액션/이모트), 현재 패널 요소 ≥5개, 패널 2개 미만, 발화자가 이미 패널에 있음 → 새 패널. 아니면 이전 패널을 **깊은 복사(clone)**해 이어붙임(대화 연속성 연출). 말풍선이 안 들어가면 삭제 후 새 패널로 재시도(백트래킹).
- **캐릭터 배치**: 최대 5명(발화자 + `talkTo` 대상), 그리디 삽입 최적화. `EvalPair`가 페널티 계산: 특정 상대를 향해 얘기 중인데 그쪽을 안 보면 **+40 중벌점**, 거리에 비례한 약한 벌점(+4×거리), 상대가 나를 안 보면 +4 경미한 벌점. 배치 후 `m_lastRight/m_lastLeft/m_lastDir`을 갱신해 다음 패널에서 캐릭터가 급격히 "순간이동"하지 않게 함(히스테리시스).
- **줌**: 머리가 잘리지 않는 한도 내에서 줌인, 변화폭 1.1배 미만이면 1.0으로 스냅(미세한 떨림 방지).
- **말풍선 크기/위치**: 텍스트 길이 기반 목표 폭 산정(짧으면 한 줄, 길면 1~3줄 목표로 랜덤화), 발화자의 화살표 앵커(`m_arrowX`) 근처에 랜덤 배치, 기존 말풍선의 "route region"과 충돌 회피. 패널마다 시드(`m_seed`)를 고정해 한 번 생성된 패널은 항상 동일하게 렌더링됨.

**신규 설계**: 위 알고리즘(패널 생성/클론 판단, 그리디 배치, 줌 스냅, 말풍선 목표폭 산정)을 **그대로 포팅**한다 — 이 부분이 원작의 "느낌"을 만드는 핵심이므로 충실도가 중요하다. 단, 말풍선 **외곽선 스플라인 수식(구식 고정배열 C 코드)은 포팅하지 않고**, 동일한 동작(랜덤 목표 줄 수, 랜덤 위치, route-region 충돌 회피)을 하는 현대적 랜덤 말풍선 모양(Canvas 곡선 경로)으로 재구현한다. 랜덤성은 전부 명시적 시드 PRNG를 인자로 받는 순수 함수로 만들어 재현 가능하게 한다.

### 4. IRC 프로토콜 → 신규 WebSocket 프로토콜

**원작 분석**: 일반 IRC PRIVMSG 텍스트에 `(#...)` 괄호 프리픽스로 제스처/표정 인덱스+강도를 인코딩. 각 클라이언트가 이를 독립적으로 해석(피어투피어에 가까운 모델) — 비-Comic Chat 클라이언트는 그냥 평문으로 보여 하위호환.

**신규 설계**: IRC 호환은 버리고, **서버가 canonical 소스**가 되는 구조로 단순화·강화한다. `packages/protocol`에 zod 스키마로 클라이언트→서버 액션(`say/think/whisper/shout/action/changeAvatar/changeNick/resize` 등)과 서버→클라이언트 브로드캐스트(**이미 해석 완료된** 감정/포즈/패널배치/말풍선 파라미터를 포함하는 `historyEntry`)를 정의한다. 서버가 감정 인식과 레이아웃을 한 번만 계산해 방송하므로, 원작이 가진 "각 클라이언트가 따로 해석해서 결과가 어긋날 수 있는" 리스크를 원천 제거한다. (클라이언트는 전송 즉시 동일 로직을 로컬로도 돌려 지연 없는 낙관적(optimistic) 미리보기를 보여주고, 서버 응답이 오면 canonical 결과로 교체한다.)

### 5. 히스토리 재생 시스템 → 이벤트 소싱 백엔드

**원작 분석**: 모든 이벤트(발화/입장/퇴장/닉변경/아바타변경/배경변경)가 `HistoryEntry`(직렬화 가능한 커맨드 객체)로 기록되고, `ExecuteHistory`로 처음부터 재생하면 전체 만화가 재구성됨. 뷰 전환·리사이즈·저장/불러오기 모두 이 메커니즘 재사용.

**신규 설계**: 이 구조를 **백엔드의 근본 아키텍처**로 승격한다. SQLite(`better-sqlite3`)에 `events(room_id, seq, actor_id, type, payload_json)` append-only 테이블을 두고, 방의 현재 만화 상태는 항상 이 로그의 순수 fold(reduce)로 도출한다. 원작과의 핵심 차이: 레이아웃에 랜덤성이 관여하므로, **랜덤 결정 결과 자체를 이벤트 payload에 함께 저장**해(시드만 저장 후 재계산하는 대신) replay가 항상 bit-exact 하도록 한다. 재연결/새 클라이언트 입장 시 이 로그를 replay해 동일한 만화를 재구성한다.

---

## 시스템 아키텍처

### 모노레포 구조 (pnpm workspaces)

```
comic-chat-remake/
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
  docs/
    phases/                # 단계별 세부 작업계획 (이 폴더)
  plan.md                  # 이 문서
  PROGRESS.md               # 단계별 진행상황 기록
```

`comic-engine`은 부수효과 없는 순수 함수(`resolveEmotion`, `matchPose`, `layoutPanel`)만 export하고, 랜덤은 전부 주입된 시드 PRNG로 처리한다. 서버와 클라이언트가 워크스페이스 링크로 **동일 버전의 동일 코드**를 import하므로 로직이 이원화되지 않는다.

### 데이터/프로토콜

- **검증**: zod, 양방향. discriminated union으로 액션/브로드캐스트 스키마 정의.
- **영속성**: SQLite(`better-sqlite3`) — 이벤트 append-only 로그 + 빠른 재접속용 `room_snapshot` 캐시 테이블(패널 폭 변경 시 무효화 후 재계산, 원작의 리사이즈-시-재배치 동작과 동일).
- **AI 캐릭터 파이프라인 동일성**: AI 캐릭터도 일반 room member로 취급(자체 `actor_id`/아바타). 실제 WebSocket 연결 없이 서버 내부에서 인간 메시지와 동일한 `handleSay()` 진입점을 호출 — 이것이 AI 메시지가 사람과 **완전히 동일한 규칙엔진·포즈매칭·패널배치**를 거치도록 보장하는 메커니즘이다.

### 렌더링: react-konva (Canvas2D 기반)

- 얼굴+몸통 레이어 합성(오프셋·미러링)이 Konva `Group`/`Image`의 x/y offset + `scaleX=-1`로 자연스럽게 매핑됨(retained-mode).
- 랜덤 말풍선+꼬리는 `Konva.Shape`의 커스텀 `sceneFunc`로 직접 그림.
- 패널이 많아져도 `.cache()`로 완성된 패널을 래스터화해 스크롤 성능 확보.
- Tauri 웹뷰에서도 Canvas2D만 쓰므로 WebGL 호환성 이슈 없음.
- PixiJS는 과도한 스펙(하비 규모에 불필요), SVG는 스프라이트 합성+랜덤 충돌계산에 부자연스러워 기각.

### 자산 변환 파이프라인 (`.avb`/`.bgb` → PNG+JSON)

`tools/avb-converter` (Node+`sharp`, RLE4/RLE8 BMP 디코더는 직접 구현 필요 — sharp는 RLE BMP 미지원):

```
bmpDecoder.ts   # BITMAPFILEHEADER+INFOHEADER+팔레트+비트 → RGBA raw
avbParser.ts    # magic(0x81)/avType/version 헤더 + AK_* 태그 스트림 파싱
compositor.ts   # 전경+마스크+아우라 → 단일 RGBA PNG (sharp.composite)
manifest.ts     # JSON 매니페스트 출력
```

**1단계는 v1.0-pre의 단순(uncompressed) 포맷**(캐릭터 22종, 배경 3종)을 대상으로 한다 — v2.x(`avbfile.h`)의 태그/zlib압축/2bpp 팔레트 포맷은 스트레치 골로 미룬다.

### AI 캐릭터 통합

`apps/server/src/ai/aiCharacter.ts`: 룸 이벤트 버스를 구독. 발언 여부는 쿨다운(최소 30~60초) + 직접 호명 시 가중치 상승(규칙엔진과 동일한 `CheckWord` 스타일 매처로 이름 감지) + 무활동 시 낮은 확률의 잡담 트리거로 스팸을 방지. 트리거되면 최근 N개 히스토리를 프롬프트로 구성해 **Claude Haiku**(Anthropic TS SDK) 호출 → 캐릭터 페르소나 시스템 프롬프트 → 반환된 텍스트를 인간과 동일한 `handleSay()`로 전달. 오류/레이트리밋 시 조용히 스킵(스팸 메시지 없음).

### Tauri 패키징

`apps/desktop/src-tauri`에 단일 웹뷰 윈도우, `tauri.conf.json`이 `apps/web`의 dist를 가리킴. 네이티브 파일시스템 접근 불필요(웹뷰가 그냥 WS 서버에 접속). MVP 이후: 알림 플러그인, 트레이 아이콘.

---

## 단계별 마일스톤 개요

상세 작업 목록은 [`docs/phases/`](docs/phases/) 참고. 각 단계는 독립적으로 데모 가능하도록 설계됨.

| 단계 | 이름 | 데모 가능한 결과물 |
|---|---|---|
| [Phase 1](docs/phases/01-text-chat-mvp.md) | 텍스트 채팅 MVP | 감정 라벨이 붙는 동작하는 텍스트 챗봇 |
| [Phase 2](docs/phases/02-static-avatar-rendering.md) | 정적 아바타 렌더링 | 줄마다 아바타+말풍선 1개가 보이는 화면 |
| [Phase 3](docs/phases/03-full-auto-layout.md) | 완전 자동 레이아웃 | "Comic Chat처럼 보이는" 패널 자동 생성 |
| [Phase 4](docs/phases/04-full-protocol-multiroom.md) | 전체 프로토콜 + 멀티룸 | 기능적으로 완성된 웹 앱 |
| [Phase 5](docs/phases/05-ai-character.md) | AI 캐릭터 | Claude Haiku 캐릭터가 대화에 참여 |
| [Phase 6](docs/phases/06-tauri-packaging.md) | Tauri 빌드 + 마무리 | macOS/Windows 데스크톱 앱 배포 |

## 검증 전략

- **규칙엔진**: STRINGTABLE 규칙을 그대로 옮긴 `(입력)→(기대 감정)` 테이블 테스트
- **포즈매칭**: 선택된 포즈가 `PI/8` 이내인지, 동일 호출 반복 시 라운드로빈이 같은 포즈를 연속 반환하지 않는지 속성 기반 테스트
- **패널레이아웃**: 고정 시드로 스크립트된 이벤트 시퀀스를 넣어 결과 JSON(픽셀 아님)을 골든파일로 스냅샷 비교; `EvalPlacement` 스코어링을 다양한 인원수/talkTo 그래프로 퍼징(예외/NaN만 체크)
- **WS 플로우**: 2개 클라이언트로 스크립트 스모크 테스트(메시지 동일 수신 확인), `RELOAD` replay가 저장된 랜덤 결정과 함께 bit-exact한지 확인
- **Tauri**: `cargo tauri build --debug` 후 웹뷰가 로컬 테스트 서버에 정상 접속하는지 수동/스크립트 스모크 테스트
- 픽셀 단위 원작 재현은 목표가 아님(동작/느낌의 재현이 목표)

## 가장 리스크가 큰 미지수 (선행 스파이크 필요)

1. **BMP RLE4/RLE8 디코딩 + 마스크/아우라 합성 엣지케이스** — 본 구현 전 실제 `.avb` 파일 2~3개로 `bmpDecoder.ts`를 먼저 검증
2. **말풍선 꼬리/route-region 충돌 기하** — 스플라인 수식을 포팅하지 않기로 했으므로, 최소 랜덤 말풍선+꼬리 알고리즘을 프로토타입해 여러 화자 패널에서 눈으로 검증 후 본 엔진에 편입
3. **패널 클론-확장 상태관리** — 패널은 교체되기 전까지 불변 스냅샷이지만 "현재" 패널은 계속 변형됨 — 이 데이터 모델(고정 배열+드래프트 레코드)을 3단계 전에 먼저 검증해 이벤트소싱 replay와 실시간 증분 업데이트가 동일한 결과를 내도록 함

## 주요 파일 (구현 시작 지점)

- `packages/comic-engine/src/rules/textpose.ts` — 감정 규칙 엔진
- `packages/comic-engine/src/avatar/matcher.ts` — 포즈 매칭
- `packages/comic-engine/src/panel/layout.ts` — 패널 레이아웃
- `packages/protocol/src/schema.ts` — WS 메시지 스키마
- `apps/server/src/ai/aiCharacter.ts` — AI 캐릭터
- `tools/avb-converter/src/bmpDecoder.ts` — 아트 변환기 진입점

## 참고 라이선스 메모

원본 저장소(`comic-chat`)는 MIT 라이선스이나 Microsoft 상표/브랜딩에 대한 유의사항이 README에 명시되어 있음 — 개인/취미 프로젝트로는 문제없으나, 공개 배포 시 "Comic Chat" 명칭·로고 사용은 피하는 것을 권장.
