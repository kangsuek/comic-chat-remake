// avatar.h의 EM_* 매크로 포팅. 8방향 감정 원환(HAPPY→COY→BORED→SCARED→SAD→ANGRY→SHOUT→LAUGH)과
// 원환 밖의 특수 제스처(WAVE/POINTOTHER/POINTSELF)를 구분한다.
export type WheelEmotion =
  | "HAPPY"
  | "COY"
  | "BORED"
  | "SCARED"
  | "SAD"
  | "ANGRY"
  | "SHOUT"
  | "LAUGH";

// WAVE/POINTOTHER/POINTSELF는 텍스트 규칙 엔진이 직접 트리거하는 제스처(Phase 1 범위).
// DOUBLEPOINT/SHRUG/3QRWALK/SIDEWALK/3QFWALK는 .avb 포즈 데이터에 실제로 존재하지만
// (Phase 2 avb-converter 스캔으로 확인) 원환 기반 포즈 매칭 대상은 아니다 — 다른 서브시스템
// (리액션/걷기 애니메이션 등, 이후 단계)이 참조할 수 있도록 타입은 완전하게 유지한다.
export type GestureEmotion =
  | "WAVE"
  | "POINTOTHER"
  | "POINTSELF"
  | "DOUBLEPOINT"
  | "SHRUG"
  | "3QRWALK"
  | "SIDEWALK"
  | "3QFWALK";

export type EmotionId = WheelEmotion | GestureEmotion | "NEUTRAL";

// avatar.h: #define EM_<X> ((float)(N * 2 * PI / 8))
export const WHEEL_ANGLE: Record<WheelEmotion, number> = {
  HAPPY: (0 * 2 * Math.PI) / 8,
  COY: (1 * 2 * Math.PI) / 8,
  BORED: (2 * 2 * Math.PI) / 8,
  SCARED: (3 * 2 * Math.PI) / 8,
  SAD: (4 * 2 * Math.PI) / 8,
  ANGRY: (5 * 2 * Math.PI) / 8,
  SHOUT: (6 * 2 * Math.PI) / 8,
  LAUGH: (7 * 2 * Math.PI) / 8,
};

// EmotionId의 런타임 값 목록 — protocol 패키지의 zod enum 등 런타임에서 값 나열이
// 필요한 곳에서 이 배열을 재사용해 타입과 값 목록이 어긋나지 않게 한다.
export const ALL_EMOTION_IDS: EmotionId[] = [
  "HAPPY",
  "COY",
  "BORED",
  "SCARED",
  "SAD",
  "ANGRY",
  "SHOUT",
  "LAUGH",
  "WAVE",
  "POINTOTHER",
  "POINTSELF",
  "DOUBLEPOINT",
  "SHRUG",
  "3QRWALK",
  "SIDEWALK",
  "3QFWALK",
  "NEUTRAL",
];
