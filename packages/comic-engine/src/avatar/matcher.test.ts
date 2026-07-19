import { describe, expect, it } from "vitest";
import type { EmotionCandidate } from "../rules/ruleEngine.js";
import { createInitialPoseState, matchComplexPose, matchPose, matchSimplePose } from "./matcher.js";

function candidate(emotion: EmotionCandidate["emotion"], intensity: number, priority: number): EmotionCandidate {
  return { emotion, intensity, priority };
}

describe("matchComplexPose", () => {
  const faces = [
    { poseIndex: 0, emotion: "NEUTRAL", intensity: 0 },
    { poseIndex: 1, emotion: "SHOUT", intensity: 1.0 },
    { poseIndex: 2, emotion: "HAPPY", intensity: 0.5 },
    { poseIndex: 3, emotion: "NEUTRAL", intensity: 0 },
  ] as const;
  const torsos = [
    { poseIndex: 0, emotion: "NEUTRAL", intensity: 0 },
    { poseIndex: 1, emotion: "POINTOTHER", intensity: 1 },
  ] as const;

  it("서로 다른 후보가 얼굴/몸통에 각각 반영된다(우선순위 높은 SHOUT→얼굴, POINTOTHER→몸통)", () => {
    const candidates = [candidate("SHOUT", 1.0, 9), candidate("POINTOTHER", 1.0, 8)];
    const result = matchComplexPose(candidates, faces, torsos, -1, -1);
    expect(result).toEqual({ faceIndex: 1, torsoIndex: 1 });
  });

  it("후보가 없으면 얼굴/몸통 모두 NEUTRAL로 폴백한다", () => {
    const result = matchComplexPose([], faces, torsos, -1, -1);
    expect(result).toEqual({ faceIndex: 0, torsoIndex: 0 });
  });

  it("NEUTRAL 폴백은 lastIndex 다음부터 라운드로빈으로 순환한다", () => {
    const first = matchComplexPose([], faces, torsos, 0, -1);
    expect(first.faceIndex).toBe(3); // idx0 다음 NEUTRAL은 idx3
    const second = matchComplexPose([], faces, torsos, 3, -1);
    expect(second.faceIndex).toBe(0); // idx3 다음은 다시 idx0으로 순환
  });

  it("몸통에 해당 제스처가 없으면 몸통은 NEUTRAL로 폴백한다", () => {
    const candidates = [candidate("SHOUT", 1.0, 9)];
    const result = matchComplexPose(candidates, faces, torsos, -1, -1);
    expect(result).toEqual({ faceIndex: 1, torsoIndex: 0 });
  });

  it("각도가 같으면 강도차가 더 작은 쪽을 고른다", () => {
    const closeFaces = [
      { poseIndex: 0, emotion: "HAPPY", intensity: 0.1 },
      { poseIndex: 1, emotion: "HAPPY", intensity: 0.9 },
    ] as const;
    const candidates = [candidate("HAPPY", 1.0, 10)];
    const result = matchComplexPose(candidates, closeFaces, torsos, -1, -1);
    expect(result.faceIndex).toBe(1); // 0.9가 1.0에 더 가까움
  });
});

describe("matchSimplePose", () => {
  const bodies = [
    { poseIndex: 0, emotion: "NEUTRAL", intensity: 0 },
    { poseIndex: 1, emotion: "POINTOTHER", intensity: 1 },
    { poseIndex: 2, emotion: "HAPPY", intensity: 1 },
  ] as const;

  it("가장 우선순위 높은 후보가 매칭되면 이후 후보는 시도하지 않는다(첫 성공에서 종료)", () => {
    const candidates = [candidate("POINTOTHER", 1.0, 9), candidate("HAPPY", 1.0, 5)];
    const result = matchSimplePose(candidates, bodies, -1);
    expect(result.bodyIndex).toBe(1); // POINTOTHER가 먼저 매칭되어 즉시 채택
  });

  it("후보가 없으면 NEUTRAL로 폴백한다", () => {
    const result = matchSimplePose([], bodies, -1);
    expect(result.bodyIndex).toBe(0);
  });

  it("강도가 가장 가까운 포즈를 고른다", () => {
    const multi = [
      { poseIndex: 0, emotion: "NEUTRAL", intensity: 0 },
      { poseIndex: 1, emotion: "HAPPY", intensity: 0.2 },
      { poseIndex: 2, emotion: "HAPPY", intensity: 0.9 },
    ] as const;
    const result = matchSimplePose([candidate("HAPPY", 1.0, 10)], multi, -1);
    expect(result.bodyIndex).toBe(2);
  });
});

describe("matchPose", () => {
  const faces = [
    { poseIndex: 0, emotion: "NEUTRAL", intensity: 0 },
    { poseIndex: 1, emotion: "SHOUT", intensity: 1.0 },
  ] as const;
  const torsos = [{ poseIndex: 0, emotion: "NEUTRAL", intensity: 0 }] as const;
  const bodies = [
    { poseIndex: 0, emotion: "NEUTRAL", intensity: 0 },
    { poseIndex: 1, emotion: "HAPPY", intensity: 1 },
  ] as const;

  it("complex 아바타는 matchComplexPose와 동일한 결과를 kind 태그와 함께 돌려주고 poseState를 갱신한다", () => {
    const poseState = createInitialPoseState();
    const result = matchPose({ kind: "complex", faces, torsos }, [candidate("SHOUT", 1.0, 9)], poseState);
    expect(result).toEqual({ kind: "complex", faceIndex: 1, torsoIndex: 0 });
    expect(poseState).toEqual({ lastFaceIndex: 1, lastTorsoIndex: 0, lastBodyIndex: -1 });
  });

  it("simple 아바타는 matchSimplePose와 동일한 결과를 kind 태그와 함께 돌려주고 poseState를 갱신한다", () => {
    const poseState = createInitialPoseState();
    const result = matchPose({ kind: "simple", bodies }, [candidate("HAPPY", 1.0, 10)], poseState);
    expect(result).toEqual({ kind: "simple", bodyIndex: 1 });
    expect(poseState).toEqual({ lastFaceIndex: -1, lastTorsoIndex: -1, lastBodyIndex: 1 });
  });
});
