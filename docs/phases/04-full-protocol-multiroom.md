# Phase 4 — 전체 프로토콜 + 멀티룸 + Complex 아바타 마감

**목표**: 발화 모드(say/think/whisper/shout/action) 전체 구현, 멀티룸(채널) 지원, 서버 canonical 해석 + 클라이언트 낙관적(optimistic) 미리보기/재조정, Complex 아바타(얼굴+몸통 합성) 마감. 이 단계 완료 시 "기능적으로 완성된 웹 앱"이 된다.

**데모 기준**: 여러 개의 방을 만들고 옮겨다닐 수 있고, 생각 말풍선/귓속말/외침/액션이 각기 다른 시각 스타일로 표시되며, 메시지 전송 시 지연 없이 즉시 로컬 미리보기가 뜨고 서버 확정 결과로 자연스럽게 교체된다.

## 선행 조건
- Phase 3 완료 (자동 레이아웃 + 이벤트 소싱)

## 작업 목록

### 1. 발화 모드 전체 구현
- [ ] `think`: 생각 말풍선 스타일(원작 `CBWoodringThink` — 꼬리 없는 구름 모양)
- [ ] `whisper`: 귓속말 — 특정 대상에게만 브로드캐스트, 말풍선 스타일 구분(`CBWoodringWhisper`)
- [ ] `shout`: 외침 — 폰트/스타일 강조, `AllCaps` 규칙과 시너지
- [ ] `action`: 액션/이모트 — 항상 새 패널 강제, 박스형 스타일(`CBWoodringBox`, 꼬리 없음)

### 2. 멀티룸
- [ ] `rooms` 테이블/맵으로 room 분리, room별 이벤트 로그·멤버 목록 독립
- [ ] 방 생성/입장/나가기 UI + 프로토콜 액션
- [ ] room별 아바타 배경(backdrop) 선택 (`changeBackdrop` 이벤트)

### 3. 서버 canonical + 클라이언트 낙관적 업데이트
- [ ] 클라이언트: 메시지 전송 즉시 로컬에서 `resolveEmotion`+`matchPose`+`layoutPanel`을 동일 `comic-engine`으로 실행 → "provisional" 패널 렌더링
- [ ] 서버 브로드캐스트 도착 시 해당 이벤트의 provisional 패널을 canonical 결과로 교체(reconcile) — react state의 낙관적 업데이트 패턴 (예: 임시 ID → 확정 ID 매핑)
- [ ] 재조정 시 시각적 튐(flicker) 최소화 (좌표/포즈가 사실상 대부분 같으므로 자연스러워야 함)

### 4. Complex 아바타 마감
- [ ] 얼굴+몸통 오프셋 합성 렌더링을 실제 Complex 캐릭터(v1.0-pre 22종 중 복합형)로 전수 검증
- [ ] `DifferentTorso` 개념(몸짓만 바꾸는 리액션, 원작의 `<Chr>`/`AddReaction`) — "리액션만 보내기" UI 액션 추가 (선택적)

### 5. 회원/닉네임 관리
- [ ] 닉네임 중복 처리, 변경(`changeNick`) 이벤트
- [ ] 멤버 목록 UI (아바타 아이콘 + 닉네임)

## 완료 조건 (Acceptance)
- [ ] 4가지 발화 모드가 시각적으로 뚜렷이 구분됨
- [ ] 2개 이상의 방을 오가며 대화 가능, 방별 히스토리 독립
- [ ] 네트워크 지연을 인위적으로 늘려도(devtools throttle) 로컬 미리보기가 즉시 뜨고, 서버 확정 후 부자연스러운 점프 없이 정착
