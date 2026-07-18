import { describe, expect, it } from "vitest";
import { computeComplexBodyBox, computeSimpleBodyBox } from "./bodyBox.js";

describe("computeSimpleBodyBox", () => {
  it("세로로 긴 이미지를 클라이언트 박스 높이에 맞춰 축소하고 하단/가운데 정렬한다", () => {
    const result = computeSimpleBodyBox({ bodyWidth: 100, bodyHeight: 200, clientWidth: 200, clientHeight: 200 });
    expect(result).toEqual({ left: 50, top: 0, width: 100, height: 200 });
  });

  it("가로로 넓은 이미지는 너비 기준으로 맞춘다", () => {
    const result = computeSimpleBodyBox({ bodyWidth: 200, bodyHeight: 100, clientWidth: 100, clientHeight: 100 });
    // widthScale=0.5, heightScale=1 -> widthScale<=heightScale -> fullWidth=100, fullHeight=trunc(0.5*100)=50
    expect(result).toEqual({ left: 0, top: 50, width: 100, height: 50 });
  });
});

describe("computeComplexBodyBox", () => {
  it("얼굴/몸통 오프셋(xCX/yCX/deltaXCX/deltaYCX)에 따라 상대 위치를 계산한다", () => {
    const result = computeComplexBodyBox({
      torsoWidth: 100,
      torsoHeight: 200,
      torsoXCX: 50,
      torsoYCX: 190,
      faceWidth: 80,
      faceHeight: 80,
      faceXCX: 40,
      faceYCX: 70,
      faceDeltaXCX: 0,
      faceDeltaYCX: -10,
      clientWidth: 100,
      clientHeight: 200,
    });

    // xOffset = 50+0-40=10, yOffset = 190-10-70=110, scale=1(딱 맞음)
    expect(result.torso).toEqual({ left: 0, top: 0, width: 101, height: 201 });
    expect(result.head).toEqual({ left: 10, top: 110, width: 81, height: 81 });
  });

  it("클라이언트 박스가 더 크면 확대 없이 등비로 맞추고 하단 중앙 정렬한다", () => {
    const result = computeComplexBodyBox({
      torsoWidth: 100,
      torsoHeight: 100,
      torsoXCX: 0,
      torsoYCX: 0,
      faceWidth: 100,
      faceHeight: 100,
      faceXCX: 0,
      faceYCX: 0,
      faceDeltaXCX: 0,
      faceDeltaYCX: 0,
      clientWidth: 200,
      clientHeight: 200,
    });
    // 얼굴/몸통이 완전히 겹치는 데이터라도 200x200 박스에 2배로 채워져야 함
    expect(result.torso).toEqual({ left: 0, top: 0, width: 201, height: 201 });
    expect(result.head).toEqual({ left: 0, top: 0, width: 201, height: 201 });
  });
});
