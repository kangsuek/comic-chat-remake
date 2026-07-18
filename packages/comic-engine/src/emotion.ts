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

export type GestureEmotion = "WAVE" | "POINTOTHER" | "POINTSELF";

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
  "NEUTRAL",
];
