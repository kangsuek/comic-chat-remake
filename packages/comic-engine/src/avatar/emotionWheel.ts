// vector2d.cpp의 각도 유틸 + avatar.h의 원환 각도 상수 사용부 포팅.
import type { EmotionId, WheelEmotion } from "../emotion.js";
import { WHEEL_ANGLE } from "../emotion.js";

// avatar.h: #define EM_NEUTRAL ((float)0.0) — EM_HAPPY와 같은 각도값이지만
// 별도 감정으로 취급된다(포즈 레코드의 intensity로 구분).
const NEUTRAL_ANGLE = 0;

/** 포즈 매칭의 "각도-최근접" 대상이 되는 감정인지(8방향 원환 + NEUTRAL) 판별한다.
 * WAVE/POINTOTHER/POINTSELF 등 제스처는 각도 개념이 없는 별도 트랙(정확히 일치하는 포즈만 채택)이다. */
export function isWheelOrNeutral(emotion: EmotionId): emotion is WheelEmotion | "NEUTRAL" {
  return emotion === "NEUTRAL" || emotion in WHEEL_ANGLE;
}

export function poseAngle(emotion: WheelEmotion | "NEUTRAL"): number {
  return emotion === "NEUTRAL" ? NEUTRAL_ANGLE : WHEEL_ANGLE[emotion];
}

/** vector2d.cpp의 value_to_angle 포팅: 임의의 라디안 값을 (-PI, PI] 범위로 정규화한다. */
export function normalizeAngle(value: number): number {
  if (value > -Math.PI && value <= Math.PI) return value;
  let temp = value / (2 * Math.PI);
  temp = (temp - Math.trunc(temp)) * 2 * Math.PI; // 소수부만 남김(C의 (int) 캐스팅은 0방향 절삭 — Math.trunc과 동일)
  if (temp > Math.PI) return temp - 2 * Math.PI;
  if (temp <= -Math.PI) return temp + 2 * Math.PI;
  return temp;
}

/** avatar.cpp 전역에서 쓰이는 fabs(subtract_angles(a, b)) 포팅: 두 각도의 원형 거리(0~PI). */
export function angleDistance(a: number, b: number): number {
  return Math.abs(normalizeAngle(a - b));
}
