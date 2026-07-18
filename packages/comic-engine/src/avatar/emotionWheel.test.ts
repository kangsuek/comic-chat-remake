import { describe, expect, it } from "vitest";
import { WHEEL_ANGLE } from "../emotion.js";
import { angleDistance, isWheelOrNeutral, normalizeAngle, poseAngle } from "./emotionWheel.js";

describe("isWheelOrNeutral", () => {
  it("8방향 원환 감정과 NEUTRAL을 true로 판별한다", () => {
    expect(isWheelOrNeutral("HAPPY")).toBe(true);
    expect(isWheelOrNeutral("LAUGH")).toBe(true);
    expect(isWheelOrNeutral("NEUTRAL")).toBe(true);
  });
  it("제스처 감정은 false", () => {
    expect(isWheelOrNeutral("WAVE")).toBe(false);
    expect(isWheelOrNeutral("POINTOTHER")).toBe(false);
  });
});

describe("poseAngle", () => {
  it("NEUTRAL은 HAPPY와 같은 0 각도", () => {
    expect(poseAngle("NEUTRAL")).toBe(0);
    expect(poseAngle("HAPPY")).toBe(WHEEL_ANGLE.HAPPY);
  });
});

describe("normalizeAngle", () => {
  it("(-PI, PI] 범위는 그대로 반환", () => {
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(Math.PI)).toBeCloseTo(Math.PI);
  });
  it("범위를 벗어나면 2PI 단위로 감아 정규화한다", () => {
    expect(normalizeAngle(2 * Math.PI)).toBeCloseTo(0);
    expect(normalizeAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(normalizeAngle(-3 * Math.PI)).toBeCloseTo(Math.PI);
  });
});

describe("angleDistance", () => {
  it("SHOUT과 LAUGH(인접 슬롯) 사이는 2PI/8", () => {
    expect(angleDistance(WHEEL_ANGLE.SHOUT, WHEEL_ANGLE.LAUGH)).toBeCloseTo((2 * Math.PI) / 8);
  });
  it("HAPPY와 SAD(정반대)는 PI", () => {
    expect(angleDistance(WHEEL_ANGLE.HAPPY, WHEEL_ANGLE.SAD)).toBeCloseTo(Math.PI);
  });
  it("원환의 양 끝(LAUGH↔HAPPY)도 인접 거리로 계산된다(원형 거리)", () => {
    expect(angleDistance(WHEEL_ANGLE.LAUGH, WHEEL_ANGLE.HAPPY)).toBeCloseTo((2 * Math.PI) / 8);
  });
});
