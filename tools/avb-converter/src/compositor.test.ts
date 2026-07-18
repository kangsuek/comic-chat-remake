import { describe, expect, it } from "vitest";
import type { DecodedDib } from "./bmpDecoder.js";
import { compositePose } from "./compositor.js";

const WHITE = { r: 255, g: 255, b: 255 };
const BLACK = { r: 0, g: 0, b: 0 };

function dib(indices: number[], width: number, height: number): DecodedDib {
  return { width, height, palette: [WHITE, BLACK], indices: Uint8Array.from(indices) };
}

function pixel(rgba: Buffer, i: number): [number, number, number, number] {
  return [rgba[i * 4]!, rgba[i * 4 + 1]!, rgba[i * 4 + 2]!, rgba[i * 4 + 3]!];
}

describe("compositePose", () => {
  it("mask/aura가 전혀 없으면 잉크만 불투명, 나머지는 투명", () => {
    // fgnd: [ink, white, white, ink] (2x2)
    const fgnd = dib([1, 0, 0, 1], 2, 2);
    const result = compositePose({ fgnd, mask: null, aura: null, useMask: true });

    expect(pixel(result.rgba, 0)).toEqual([0, 0, 0, 255]); // ink
    expect(pixel(result.rgba, 1)).toEqual([0, 0, 0, 0]); // 투명
    expect(pixel(result.rgba, 2)).toEqual([0, 0, 0, 0]); // 투명
    expect(pixel(result.rgba, 3)).toEqual([0, 0, 0, 255]); // ink
  });

  it("aura 영역은 흰 배경을 불투명 흰색으로 강제한다(mask/useMask와 무관)", () => {
    const fgnd = dib([0, 0], 2, 1); // 전부 흰 배경
    const aura = dib([1, 0], 2, 1); // 첫 픽셀만 aura 실루엣
    const result = compositePose({ fgnd, mask: null, aura, useMask: false });

    expect(pixel(result.rgba, 0)).toEqual([255, 255, 255, 255]); // aura 영역 → 불투명 흰색
    expect(pixel(result.rgba, 1)).toEqual([0, 0, 0, 0]); // aura 밖 → 투명
  });

  it("useMask=false면 mask가 있어도 무시한다(HEADMASK/TORSOMASK 꺼짐)", () => {
    const fgnd = dib([0], 1, 1);
    const mask = dib([1], 1, 1); // 실루엣 있음
    const result = compositePose({ fgnd, mask, aura: null, useMask: false });

    expect(pixel(result.rgba, 0)).toEqual([0, 0, 0, 0]); // 투명(마스크 무시됨)
  });

  it("useMask=true면 mask 영역을 불투명 흰색으로 강제한다", () => {
    const fgnd = dib([0], 1, 1);
    const mask = dib([1], 1, 1);
    const result = compositePose({ fgnd, mask, aura: null, useMask: true });

    expect(pixel(result.rgba, 0)).toEqual([255, 255, 255, 255]);
  });

  it("잉크는 mask/aura가 흰색으로 강제한 영역도 덮어쓴다(fgnd가 마지막에 그려짐)", () => {
    const fgnd = dib([1], 1, 1); // ink
    const mask = dib([1], 1, 1); // 같은 자리에 mask도 있음
    const result = compositePose({ fgnd, mask, aura: null, useMask: true });

    expect(pixel(result.rgba, 0)).toEqual([0, 0, 0, 255]); // 여전히 검정
  });

  it("mask/aura가 fgnd와 크기가 달라도 최근접 이웃으로 리샘플링해 합성한다", () => {
    // 실측 결과 일부 실제 아바타 포즈에서 fgnd/mask/aura 원본 해상도가 서로 다름
    // (원작은 StretchDIBits로 동일 목적지 사각형에 맞춰 그리므로 원본 크기가 달라도 된다).
    const fgnd = dib([0, 0, 0, 0], 4, 1); // 전부 흰 배경
    const aura = dib([1, 0], 2, 1); // 절반만 실루엣, fgnd보다 좁은 해상도
    const result = compositePose({ fgnd, mask: null, aura, useMask: false });

    expect(pixel(result.rgba, 0)).toEqual([255, 255, 255, 255]);
    expect(pixel(result.rgba, 1)).toEqual([255, 255, 255, 255]);
    expect(pixel(result.rgba, 2)).toEqual([0, 0, 0, 0]);
    expect(pixel(result.rgba, 3)).toEqual([0, 0, 0, 0]);
  });
});
