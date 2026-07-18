# Phase 2 — 정적 아바타 렌더링 (줄당 1패널)

**목표**: 원작 `.avb` 캐릭터 아트를 변환해, 메시지 하나당 패널 하나에 아바타(감정에 맞는 포즈)와 말풍선을 그린다. 아직 패널 클론/연속성/그리디 배치는 없음(다음 단계).

**데모 기준**: 채팅창 대신 세로로 쌓이는 만화 패널 목록이 보이고, 메시지를 보내면 선택한 캐릭터가 해당 감정에 맞는 표정으로 말풍선과 함께 새 패널에 등장한다.

## 선행 조건
- Phase 1 완료 (감정 규칙 엔진 + WS 파이프라인)

## 작업 목록

### 0. 스파이크 결과 (완료 — 2026-07-18, 22개 `.avb` 전체 + 배경 3종 실측 검증)

실제 파일을 바이트 단위로 파싱·렌더링해 아래 내용을 확정했다. 상세 근거는 `v1.0-pre/client/avatario.cpp`(태그 스트림 파싱), `dib.cpp`(DIB/RLE4 디코드), `bodycam.cpp`(`DrawBody`/`GetBodyBox`, 합성·배치 알고리즘)에서 직접 추적.

- **파일 구조**: `[header: magicNum(0x81)/avType(1=SIMPLE,2=COMPLEX)/version]` → `[태그 스트림: AK_NAME/AK_STYLE/AK_FLAGS/AK_ICON + AK_NFACES(+43B FACEREC×n)/AK_NTORSOS(+35B TORSOREC×n) 또는 AK_NBODIES(+35B RBODYREC×n)]` → `AK_STARTDATA` → 이후 각 레코드의 `fgndOffset/transOffset/auraOffset`가 가리키는 **파일 절대 오프셋**에 raw DIB(BMP) 블록들이 이어짐. 연속 레코드의 `fgndOffset`이 직전과 같으면("ditto") 동일 poseID를 재사용(픽셀 데이터 중복 저장 안 함).
- **비트뎁스/압축 (실측, 22개 아바타 전수 + 배경 3종 전수)**:
  - 캐릭터 얼굴/몸통/몸 아트(`fgnd`/`mask`/`aura`) — **전부 1bpp `BI_RGB`(비압축)**. RLE 불필요.
  - 배경 3종(`field/pastoral/room8bs.bmp`, 315×315) — **4bpp `BI_RLE4`**.
  - 아바타 선택 아이콘(40×40) — **4bpp `BI_RLE4`**.
  - **`BI_RLE8`은 v1.0-pre 전체에서 사용처가 전혀 없다** — RLE8 디코더는 만들지 않는다(필요해지면 v2.x 포맷을 다룰 Phase 6 스트레치에서).
- **합성 알고리즘 확정** (`bodycam.cpp`의 `DrawBody`가 쓰는 GDI ROP를 알파합성으로 치환):
  1. `aura`(확장 실루엣) 존재 시 항상 적용 — 원작은 `MERGEPAINT`(=`(NOT src) OR dst`)로 그 영역을 흰색으로 강제(후광).
  2. `mask`(실루엣) 존재 시 **아바타 레벨 플래그가 켜진 경우에만** 적용(`HEADMASK`=1, `TORSOMASK`=2, `avatar.h`) — 마찬가지로 `MERGEPAINT`로 흰색 강제.
  3. `fgnd`(흑백 잉크선 아트, 실측으로 렌더링해 확인 — 원작 아트는 색칠이 아니라 흑백 라인아트) — `SRCAND`로 그림: 검은 픽셀→강제 검정, 흰 픽셀→배경 그대로 통과.
  - 알파 합성 치환: **검은 잉크=불투명 검정 / (mask∪aura 영역 내의) 흰 배경=불투명 흰색 / 그 외=완전 투명**.
  - `TORSOFIRST`(=4) 플래그는 합성이 아니라 **머리/몸통 z-order**(어느 쪽을 나중에 그려 위에 보이게 할지)를 결정 — 매니페스트에 포함해 렌더러가 사용.
- **머리/몸통 위치 계산식 확정** (`GetBodyBox`, Complex 전용):
  `xOffset = torso.xCX + face.delta_xCX - face.xCX`, `yOffset`도 동일 패턴. 이 오프셋 + 각 이미지 크기로 바운딩박스를 구하고, 대상 영역에 맞춰 등비 스케일 후 **하단 중앙 정렬**한다. 이 스케일/정렬 계산은 패널 크기에 의존하므로 컨버터가 아니라 **렌더러(Konva)가 그대로 포팅**한다(자산에 구워 넣지 않음).

### 1. `.avb` 컨버터 (`tools/avb-converter`) — 완료 (2026-07-18)
- [x] `bmpDecoder.ts`: `BITMAPFILEHEADER`+`BITMAPINFOHEADER`+팔레트+비트 파서. **RLE4만** 구현(`dib.cpp`의 `Convert4ToNonRLE`/`MyWrite` 포팅: 니블 단위 run/absolute 모드, count-value 페어 + escape 코드 0=EOL/1=EOB/2=delta/3+=absolute). RLE8은 구현하지 않음(위 스파이크 결과). 합성 실측 BMP(icon/backdrop)로 교차검증 완료.
- [x] `avbParser.ts`: 헤더(`magicNum=0x81`, `avType`, `version`) + 태그 스트림 파싱, 43B face / 35B torso·body 레코드, `emFloats[]` 인덱스→감정 매핑, ditto 처리. 22개 파일 전수 파싱 성공, 헥스 수동분석과 100% 일치 확인.
- [x] `compositor.ts`: 확정 알고리즘대로 알파합성, `HEADMASK`/`TORSOMASK` 플래그 분기. **구현 중 추가로 확인한 사실**: `mask`/`aura`가 `fgnd`와 원본 해상도가 다를 수 있음(원작이 `StretchDIBits`로 항상 동일 목적지 사각형에 맞춰 그리기 때문 — 세 레이어가 원본 픽셀 크기까지 같을 필요는 없다) → 최근접 이웃 리샘플링으로 대응.
- [x] `manifest.ts`: `{characterId, name, kind, flags, icon, poses, faces/torsos 또는 bodies}` — 공용 타입은 새 패키지 `packages/asset-manifest-types`로 분리(plan.md 설계대로).
- [x] v1.0-pre 캐릭터 22종 + 배경 3종 전체 변환, `apps/web/public/assets/`에 커밋(PNG 367개, 2.3MB). 여러 실제 파일을 색상 배경에 합성해 육안 검증(흰 후광 + 검은 잉크선 + 투명 배경 정확히 재현).
- **중요한 추가 발견**: `avatario.cpp`의 `LoadAvatarInfo`는 내부 `AK_NAME` 태그를 **의도적으로 버리고** `.avb` **파일명**을 진짜 캐릭터 이름으로 쓴다(`// FOR NOW, IGNORE INTERNAL NAME FIELD`. `GetAllAvatarNames()`도 디렉터리 스캔 파일명으로 목록을 만듦). 예: `glenda.avb`의 내부 `AK_NAME`은 "Greg"이지만 실제 표시 이름은 "glenda"다. 컨버터는 파일명을 채택하도록 구현했다.

### 2. 포즈 매칭 엔진 (`packages/comic-engine/src/avatar/`) — 완료 (2026-07-18)
- [x] `emotionWheel.ts`: 8방향 각도 상수 재사용(`WHEEL_ANGLE`) + `normalizeAngle`/`angleDistance`(`vector2d.cpp`의 `value_to_angle`/`subtract_angles` 포팅) + `isWheelOrNeutral`/`poseAngle`
- [x] `matcher.ts`: `matchComplexPose`/`matchSimplePose` (`avatar.cpp`의 `GetBodyFromEmotion(CEmotionOpts&)` 계열 포팅)
- [x] Simple(단일 스프라이트) / Complex(얼굴+몸통 분리) 두 케이스 모두 처리
- [x] 단위 테스트 16개 + 실제 Mike 매니페스트로 교차검증(SHOUT+POINTOTHER 동시 입력 시 얼굴=SHOUT·몸통=POINTOTHER로 서로 다른 후보가 반영됨을 확인)
- **중요한 설계 정정**: 원작 소스를 실제로 추적해보니 `matchPose(targetEmotion, ...)`처럼 감정 "하나"를 받는 게 아니었다. 실제 파이프라인(`textpose.cpp`의 `ChatPreSendText` → `av->GetBodyFromEmotion(emo)`)은 `CEmotionOpts`(=Phase 1 `resolveEmotion()`의 **전체 후보 리스트**)를 우선순위 내림차순으로 순회하며, 후보마다 얼굴(각도-최근접)과 몸통(제스처면 정확일치)을 **독립적으로** 채운다 — 예: SHOUT 후보가 얼굴을, 뒤이은 POINTOTHER 후보가 몸통을 채우는 식. 그래서 시그니처를 `matchComplexPose(candidates, faces, torsos, lastFaceIndex, lastTorsoIndex)` / `matchSimplePose(candidates, bodies, lastBodyIndex)`로 바꿨다(kind별 분리 — 제네릭 유니온보다 호출부가 명확함).
- **라운드로빈 관련 정정**: 원작에서 `m_lastFace`/`m_lastTorso`/`m_lastBody`(라운드로빈 시작점)는 포즈 매칭이 아니라 **NEUTRAL 폴백에서만** 쓰인다(`Set*Neutral`). 실제 감정이 매칭될 때는 항상 처음부터 순수 각도/강도 최근접 탐색이고, 라운드로빈은 "매칭되는 게 하나도 없을 때 어떤 NEUTRAL 포즈를 보여줄지"만 다양화한다. 또한 `m_lastX` 갱신(`RecordBody`)은 포즈를 매칭한 시점이 아니라 **패널에 실제로 배치가 확정된 시점**(`panel.cpp`)에 일어난다 — Phase 2는 패널 배치가 없으므로 "메시지 하나 = 패널 하나 확정"으로 간주해 매 메시지마다 상태를 갱신하는 것으로 단순화한다(Phase 3에서 패널 클론/백트래킹이 들어오면 재검토 필요).

### 3. 렌더러 (`apps/web`) — 완료 (2026-07-18)
- [x] `react-konva` 설치, `PanelCanvas` 컴포넌트 (고정 크기 패널 1개 렌더링, 기본 배경은 원작과 동일하게 `room8bs`)
- [x] `AvatarSprite` 컴포넌트: simple은 이미지 1장, complex는 torso+face 레이어를 `computeComplexBodyBox`(comic-engine으로 포팅한 `GetBodyBox`)로 배치해 `Group`으로 합성, `flags.torsoFirst`로 z-order 결정. `m_flip`/talkTo 방향 반전은 Phase 3(멀티 캐릭터 배치) 전까지 필요 없어 `flip` prop만 마련해두고 항상 false로 둠.
- [x] `SpeechBubble` 컴포넌트: 단순 사각/둥근 모서리 말풍선 + 꼬리 하나(랜덤화 없음, Phase 3에서 고도화)
- [x] 메시지 수신 시 서버가 계산한 `pose`를 그대로 렌더링, 패널을 `flex-wrap`으로 쌓기(세로 리스트 대신 여러 열로 흐르게 함 — 필요시 조정 가능)

### 4. 서버 연동 — 완료 (2026-07-18)
- [x] `Room.say()`에서 `resolveEmotion()` 다음 `matchComplexPose`/`matchSimplePose`까지 호출해 `historyEntry`에 `characterId`+`pose`(faceIndex/torsoIndex 또는 bodyIndex) 포함해 브로드캐스트. 액터별 라운드로빈 상태(`lastFaceIndex`/`lastTorsoIndex`/`lastBodyIndex`)를 `Room`이 보관.
- [x] 캐릭터 선택 UI: `NicknameGate`가 `catalog.json`을 fetch해 22개 아이콘을 그리드로 보여주고 선택하게 함. `join` 액션에 `characterId` 추가(존재하지 않는 값이면 서버가 입장을 거부).
- 실제 브라우저 2탭 E2E로 Complex(Mike: SHOUT→찡그린 표정, ROTFL→웃는 표정으로 포즈가 실제로 바뀜)와 Simple(Tux: 전신 스프라이트) 양쪽 다 확인 완료.

## 완료 조건 (Acceptance)
- [x] 22개 캐릭터 전원 변환 완료, 아바타 목록 UI(NicknameGate)에서 아이콘으로 미리보기 가능
- [x] 감정별로 다른 포즈가 실제로 바뀌어 보임 — 브라우저로 `"SO GREAT!!!"`(SHOUT)와 `"ROTFL..."`(LAUGH) 확인, 서로 다른 표정으로 렌더링됨
- [x]~~동일 감정 반복 전송 시 포즈가 매번 동일하지 않고 라운드로빈으로 바뀜~~ → **원작 재확인 결과 이 기준 자체가 잘못된 가정이었다**: 라운드로빈은 매칭 성공 시가 아니라 **NEUTRAL 폴백에서만** 작동한다(위 "2. 포즈 매칭 엔진"의 정정 사항). 같은 감정을 반복 전송하면 각도+강도 최근접 탐색이 매번 결정적으로 동일한 포즈를 고르는 게 원작과 일치하는 정확한 동작이다. 대신 "후보가 없을 때(예: 감정 트리거가 없는 문장 반복) NEUTRAL 포즈가 라운드로빈으로 바뀜"으로 기준을 정정한다 — `matcher.test.ts`에서 단위 테스트로 검증 완료.

## 리스크 / 메모
- ~~RLE 디코딩 스파이크가 실패하면...~~ → 스파이크 완료, 리스크 해소(위 "0. 스파이크 결과" 참고). RLE4만 필요, RLE8은 불필요.
- Phase 2는 "메시지 하나 = 패널 하나"만 지원한다. 패널 클론/캐릭터 그리디 배치/talkTo 방향 반전/랜덤 말풍선 크기·위치는 전부 Phase 3.
