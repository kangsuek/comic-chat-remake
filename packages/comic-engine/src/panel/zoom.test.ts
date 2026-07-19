import { describe, expect, it } from "vitest";
import { isEstablishing, layoutBodies, type BodyDim, type ZoomLayoutInput } from "./zoom.js";

describe("isEstablishing", () => {
  it("전체 패널이 1개 이하면 항상 설정샷", () => {
    expect(isEstablishing(0, true)).toBe(true);
    expect(isEstablishing(1, true)).toBe(true);
    expect(isEstablishing(1, false)).toBe(true);
  });

  it("2개면 방금 새로 만든 패널이 아닐 때만(=클론일 때만) 설정샷", () => {
    expect(isEstablishing(2, false)).toBe(true);
    expect(isEstablishing(2, true)).toBe(false);
  });

  it("3개 이상이면 설정샷이 아니다", () => {
    expect(isEstablishing(3, false)).toBe(false);
    expect(isEstablishing(3, true)).toBe(false);
  });
});

const baseInput: ZoomLayoutInput = { unitWidth: 1090, unitHeight: 1900, zoomIn: true, establishing: false };

function singleBodyDim(width: number): BodyDim {
  // height=1000=maxBodyHeight(=trunc(1900/1.9))이므로 정규화 스케일 비율이 1로 고정되어 계산이 단순해진다.
  return { actorId: "a", width, height: 1000, normHeight: 1, headHeight: 10, arrowXRatio: 0.5 };
}

describe("layoutBodies - 줌 스냅 경계값", () => {
  it("zoomFactor 후보가 1.09면 1.0으로 스냅한다", () => {
    const result = layoutBodies([singleBodyDim(1000)], { ...baseInput, unitWidth: 1090 });
    expect(result.zoomFactor).toBeCloseTo(1.0);
  });

  it("zoomFactor 후보가 정확히 1.10이면 스냅하지 않는다(경계값 포함)", () => {
    const result = layoutBodies([singleBodyDim(1000)], { ...baseInput, unitWidth: 1100 });
    expect(result.zoomFactor).toBeCloseTo(1.1);
  });

  it("zoomFactor 후보가 1.11이면 그대로 확대한다", () => {
    const result = layoutBodies([singleBodyDim(1000)], { ...baseInput, unitWidth: 1110 });
    expect(result.zoomFactor).toBeCloseTo(1.11);
  });

  it("establishing이면 확대를 건너뛴다(zoomFactor=1.0)", () => {
    const result = layoutBodies([singleBodyDim(1000)], { ...baseInput, unitWidth: 1110, establishing: true });
    expect(result.zoomFactor).toBe(1.0);
  });

  it("zoomIn이 false면 확대를 건너뛴다(zoomFactor=1.0)", () => {
    const result = layoutBodies([singleBodyDim(1000)], { ...baseInput, unitWidth: 1110, zoomIn: false });
    expect(result.zoomFactor).toBe(1.0);
  });
});

describe("layoutBodies - 폭 초과 시 축소", () => {
  it("합산 폭이 unitWidth를 넘으면 축소하고 zoomFactor는 1.0을 유지한다", () => {
    const dims: BodyDim[] = [singleBodyDim(1000), singleBodyDim(1000)];
    const result = layoutBodies(dims, { ...baseInput, unitWidth: 1000 });

    expect(result.zoomFactor).toBe(1.0);
    const totalWidth = result.boxes.reduce((sum, b) => sum + (b.right - b.left), 0);
    expect(totalWidth).toBeLessThanOrEqual(1000);
  });
});

describe("layoutBodies - 최종 배치", () => {
  it("입력이 없으면 빈 결과를 반환한다", () => {
    expect(layoutBodies([], baseInput)).toEqual({ boxes: [], zoomFactor: 1.0 });
  });

  it("여러 몸을 좌우로 마진을 두고 순서대로 배치한다", () => {
    const dims: BodyDim[] = [singleBodyDim(200), singleBodyDim(200)];
    const result = layoutBodies(dims, { ...baseInput, unitWidth: 1000, zoomIn: false });

    expect(result.boxes).toHaveLength(2);
    expect(result.boxes[0]!.left).toBeGreaterThan(0);
    expect(result.boxes[1]!.left).toBeGreaterThan(result.boxes[0]!.right);
  });

  it("arrowX는 bbox 폭에 arrowXRatio를 곱해 left에 더한 값이다", () => {
    const dims: BodyDim[] = [{ ...singleBodyDim(200), arrowXRatio: 0.25 }];
    const result = layoutBodies(dims, { ...baseInput, unitWidth: 1000, zoomIn: false });
    const box = result.boxes[0]!;
    expect(box.arrowX).toBe(box.left + Math.floor(0.25 * (box.right - box.left) + 0.5));
  });
});
