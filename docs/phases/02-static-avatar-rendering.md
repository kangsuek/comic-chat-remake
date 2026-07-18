# Phase 2 — 정적 아바타 렌더링 (줄당 1패널)

**목표**: 원작 `.avb` 캐릭터 아트를 변환해, 메시지 하나당 패널 하나에 아바타(감정에 맞는 포즈)와 말풍선을 그린다. 아직 패널 클론/연속성/그리디 배치는 없음(다음 단계).

**데모 기준**: 채팅창 대신 세로로 쌓이는 만화 패널 목록이 보이고, 메시지를 보내면 선택한 캐릭터가 해당 감정에 맞는 표정으로 말풍선과 함께 새 패널에 등장한다.

## 선행 조건
- Phase 1 완료 (감정 규칙 엔진 + WS 파이프라인)

## 작업 목록

### 1. `.avb` 컨버터 (`tools/avb-converter`)
- [ ] `bmpDecoder.ts`: `BITMAPFILEHEADER`+`BITMAPINFOHEADER`+팔레트+비트 파서. RLE8/RLE4 압축 해제 구현 (`v1.0-pre/client/dib.cpp`의 `Convert8ToNonRLE`/`Convert4ToNonRLE` 참고: count-value 페어 + escape 코드 0=EOL/1=EOB/2=delta)
  - [ ] **스파이크**: 실제 `.avb` 파일 2~3개(`v1.0-pre/client/comicart/avatars/*.avb`)로 디코더를 먼저 검증 — 언더도큐먼트된 패딩/투명 인덱스 이슈 확인
- [ ] `avbParser.ts`: 헤더(`magicNum=0x81`, `avType`, `version`) + 태그 스트림(`AK_NAME`, `AK_FLAGS`, `AK_ICON`, `AK_NFACES`/`AK_NTORSOS`/`AK_NBODIES`, `AK_ENDDATA`) 파싱. 43B face record / 35B torso·body record 고정 레이아웃 파싱 (`fgndOffset/transOffset/auraOffset`, `emotion`, `intensity`, complex면 `xCX/yCX/delta_xCX/delta_yCX/faceX/faceY`)
- [ ] `compositor.ts`: 전경 DIB + 마스크(투명) + 아우라(글로우)를 `sharp.composite()`로 단일 RGBA PNG 1장으로 합성 (mask/aura offset=0이면 생략)
- [ ] `manifest.ts`: 캐릭터별 `{characterId, kind: "simple"|"complex", poses: [...], backdrops: [...]}` JSON 출력
- [ ] v1.0-pre 캐릭터 22종 + 배경 3종 전체 변환 실행, 결과물을 `apps/web/public/assets/`에 커밋

### 2. 포즈 매칭 엔진 (`packages/comic-engine/src/avatar/`)
- [ ] `emotionWheel.ts`: 8방향 각도 상수(`EM_HAPPY..EM_LAUGH`, `2π/8` 간격) + 특수 제스처 상수(`EM_WAVE`, `EM_POINTOTHER`, `EM_POINTSELF` 등)
- [ ] `matcher.ts`: `matchPose(targetEmotion, avatarManifest, lastState): PoseId` — 각도거리 `PI/8` 이내 후보 중 강도차 최소 선택 + neutral 폴백, `lastState`(직전 선택 인덱스)로 라운드로빈 시작점 이동 (`avatar.cpp`의 `GetBodyFromEmotion` 로직 포팅)
- [ ] Simple(단일 스프라이트) / Complex(얼굴+몸통 분리) 두 케이스 모두 처리
- [ ] 단위 테스트: 합성 포즈 라이브러리로 각도거리/라운드로빈 속성 테스트

### 3. 렌더러 (`apps/web`)
- [ ] `react-konva` 설치, `PanelCanvas` 컴포넌트 (고정 크기 패널 1개 렌더링)
- [ ] `AvatarSprite` 컴포넌트: simple은 이미지 1장, complex는 torso+face 레이어를 오프셋에 맞춰 `Group`으로 합성, `m_flip`에 해당하는 `scaleX=-1` 미러링
- [ ] `SpeechBubble` 컴포넌트: 우선 단순 사각/둥근 모서리 말풍선 + 꼬리 하나(랜덤화 없음, Phase 3에서 고도화)
- [ ] 메시지 수신 시 `matchPose()` 호출 → 패널에 아바타+말풍선 렌더링, 패널을 세로 리스트로 쌓기

### 4. 서버 연동
- [ ] `handleSay()`에서 `resolveEmotion()` 다음 `matchPose()`까지 호출해 `historyEntry`에 `poseId` 포함해 브로드캐스트 (레이아웃은 아직 없음 — 클라가 단순 배치)
- [ ] 캐릭터 선택 UI(닉네임 등록 시 아바타 목록에서 선택)

## 완료 조건 (Acceptance)
- [ ] 22개 캐릭터 전원 변환 완료, 아바타 목록 UI에서 미리보기 가능
- [ ] 감정별로 다른 포즈가 실제로 바뀌어 보임 (수동으로 `":)"`, `"I'M SO ANGRY!!!"` 등 입력해 확인)
- [ ] 동일 감정 반복 전송 시 포즈가 매번 동일하지 않고 라운드로빈으로 바뀜

## 리스크 / 메모
- RLE 디코딩 스파이크가 실패하면 range를 좁혀 비압축 포즈만 우선 지원하고 압축 포즈는 Phase 6 스트레치로 미룬다.
