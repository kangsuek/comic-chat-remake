# Phase 6 — Tauri 빌드 + 마무리

**목표**: macOS/Windows 네이티브 데스크톱 앱으로 패키징하고, 남은 폴리시(추가 캐릭터/배경, v2.x 포맷 스트레치 골)를 처리한다.

**데모 기준**: macOS `.dmg`(또는 `.app`)와 Windows `.exe` 설치 파일을 각각 실행하면 데스크톱 창에서 웹 버전과 동일하게 동작한다.

## 선행 조건
- Phase 5 완료 (AI 캐릭터까지 포함한 기능 완성)

## 작업 목록

### 1. Tauri 셸 (`apps/desktop`)
- [ ] `cargo tauri init` (또는 `pnpm create tauri-app` 연동), `src-tauri/tauri.conf.json`에서 `frontendDist`를 `apps/web`의 빌드 산출물로 지정
- [ ] 단일 `WebviewWindow` 설정 (타이틀, 아이콘, 기본 창 크기)
- [ ] 개발 모드(`devUrl` → `apps/web` dev server)와 빌드 모드 분리 확인

### 2. 빌드 파이프라인
- [ ] `pnpm --filter web build` → `cargo tauri build` (또는 `pnpm tauri build`) macOS/Windows 각각 실행 스크립트화
- [ ] 서버 접속 주소를 빌드 시점 설정 가능하게 (환경변수 또는 앱 내 설정 화면)

### 3. 네이티브 폴리시 (선택)
- [ ] `tauri-plugin-notification`: 새 메시지 백그라운드 알림
- [ ] 시스템 트레이 아이콘 (창 숨김/보이기)

### 4. 자산 확장 (스트레치 골)
- [ ] v2.x `.avb`/`.bgb` 포맷(`artifacts/avtools/avbfile.h` 기준: 태그별 이미지 포맷 바이트, zlib-deflate 압축, 2bpp `AIP_MASKEDMONO`/`AIP_DUALMASK` 팔레트) 지원 추가 → v2.1b/v2.5-beta-1의 캐릭터 31종, 배경 9종까지 확장
- [ ] 추가 배경/캐릭터 미리보기 갤러리 UI

### 5. 마무리 점검
- [ ] README 작성 (실행 방법, 아키텍처 개요, 라이선스/상표 유의사항 명시)
- [ ] 전체 테스트 스위트 재실행 (Phase 1~5의 모든 완료 조건 재확인 — 회귀 없는지)

## 완료 조건 (Acceptance)
- [ ] macOS 빌드가 별도 서버 환경에서 실제로 접속/대화 가능
- [ ] Windows 빌드가 동일하게 동작 (또는 최소 스모크 테스트 통과)
- [ ] `cargo tauri build --debug` 후 웹뷰가 로컬 테스트 서버에 정상 접속하는 스모크 테스트 스크립트 존재

## 리스크 / 메모
- Windows 빌드는 CI(GitHub Actions 등) 또는 별도 Windows 머신 없이는 로컬에서 크로스컴파일이 까다로울 수 있음 — 필요시 GitHub Actions matrix 빌드로 해결 (원본 저장소의 `docs/UNOFFICIAL-RELEASE.md` 방식 참고 가능).
