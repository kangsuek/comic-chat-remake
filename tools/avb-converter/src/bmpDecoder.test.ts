import { describe, expect, it } from "vitest";
import { decodeDibAt, dibToRgba } from "./bmpDecoder.js";

/** BITMAPFILEHEADER(14B) + BITMAPINFOHEADER(40B) + palette(numColors*4B) + bits 를 조립한다. */
function buildDib(opts: {
  width: number;
  height: number;
  bitCount: 1 | 4;
  compression: number;
  palette: Array<[number, number, number]>; // r,g,b
  bits: number[];
}): Buffer {
  const { width, height, bitCount, compression, palette, bits } = opts;
  const paletteSize = palette.length * 4;
  const bfOffBits = 14 + 40 + paletteSize;
  const bitsBuf = Buffer.from(bits);
  const bfSize = bfOffBits + bitsBuf.length;

  const buf = Buffer.alloc(bfSize);
  buf.writeUInt16LE(0x4d42, 0); // 'BM'
  buf.writeUInt32LE(bfSize, 2);
  buf.writeUInt16LE(0, 6);
  buf.writeUInt16LE(0, 8);
  buf.writeUInt32LE(bfOffBits, 10);

  buf.writeUInt32LE(40, 14); // biSize
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26); // biPlanes
  buf.writeUInt16LE(bitCount, 28);
  buf.writeUInt32LE(compression, 30);
  buf.writeUInt32LE(bitsBuf.length, 34);
  buf.writeUInt32LE(0, 38);
  buf.writeUInt32LE(0, 42);
  buf.writeUInt32LE(0, 46);
  buf.writeUInt32LE(0, 50);

  let p = 54;
  for (const [r, g, b] of palette) {
    buf.writeUInt8(b, p);
    buf.writeUInt8(g, p + 1);
    buf.writeUInt8(r, p + 2);
    buf.writeUInt8(0, p + 3);
    p += 4;
  }

  bitsBuf.copy(buf, bfOffBits);
  return buf;
}

const WHITE: [number, number, number] = [255, 255, 255];
const BLACK: [number, number, number] = [0, 0, 0];

describe("decodeDibAt — 1bpp BI_RGB", () => {
  it("bottom-up 4바이트 정렬 스캔라인을 top-down 인덱스 배열로 복원한다", () => {
    // 4x2 이미지, top-down 의도: row0=[1,0,1,0], row1=[0,0,1,1]
    // DIB는 bottom-up 저장이므로 파일엔 row1(bottom) 먼저, row0(top) 나중.
    const bits = [
      0b00110000, 0x00, 0x00, 0x00, // file row0 = image row1(bottom): 0,0,1,1
      0b10100000, 0x00, 0x00, 0x00, // file row1 = image row0(top):    1,0,1,0
    ];
    const buf = buildDib({ width: 4, height: 2, bitCount: 1, compression: 0, palette: [WHITE, BLACK], bits });

    const dib = decodeDibAt(buf, 0);
    expect(dib.width).toBe(4);
    expect(dib.height).toBe(2);
    expect(Array.from(dib.indices)).toEqual([1, 0, 1, 0, 0, 0, 1, 1]);
  });

  it("offset가 0이 아닌 위치(.avb 파일 중간)에서도 정확히 읽는다", () => {
    const bits = [0b11110000, 0x00, 0x00, 0x00, 0b00000000, 0x00, 0x00, 0x00];
    const dibBuf = buildDib({ width: 4, height: 2, bitCount: 1, compression: 0, palette: [WHITE, BLACK], bits });
    const padded = Buffer.concat([Buffer.alloc(100, 0xcc), dibBuf]);

    const dib = decodeDibAt(padded, 100);
    expect(Array.from(dib.indices)).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
  });

  it("dibToRgba가 팔레트를 통해 불투명 RGBA로 변환한다", () => {
    const bits = [0b10000000, 0x00, 0x00, 0x00];
    const buf = buildDib({ width: 1, height: 1, bitCount: 1, compression: 0, palette: [WHITE, BLACK], bits });
    const dib = decodeDibAt(buf, 0);
    const rgba = dibToRgba(dib);
    expect(Array.from(rgba)).toEqual([0, 0, 0, 255]);
  });
});

describe("decodeDibAt — 4bpp BI_RLE4", () => {
  it("run 모드 + EOL + EOB을 해제한다", () => {
    // dib.cpp Convert4ToNonRLE 포팅 검증용 손수 인코딩:
    // row(bottom, 먼저 방출)=[1,1,1,1] run, EOL로 4바이트 경계까지 패딩
    // row(top, 나중 방출)=[2,10,2,10] run, EOB
    const compressed = [0x04, 0x11, 0x00, 0x00, 0x04, 0x2a, 0x00, 0x01];
    const buf = buildDib({
      width: 4,
      height: 2,
      bitCount: 4,
      compression: 2,
      palette: Array.from({ length: 16 }, () => WHITE),
      bits: compressed,
    });

    const dib = decodeDibAt(buf, 0);
    expect(Array.from(dib.indices)).toEqual([2, 10, 2, 10, 1, 1, 1, 1]);
  });

  it("absolute 모드(홀수 개수) + 워드 경계 패딩을 해제한다", () => {
    // 6픽셀 [3,7,1,4,9,2]을 absolute 모드로 인코딩(3바이트=홀수 위치이므로 패딩 1바이트 필요)
    const compressed = [0x00, 0x06, 0x37, 0x14, 0x92, 0x00, 0x00, 0x01];
    const buf = buildDib({
      width: 6,
      height: 1,
      bitCount: 4,
      compression: 2,
      palette: Array.from({ length: 16 }, () => WHITE),
      bits: compressed,
    });

    const dib = decodeDibAt(buf, 0);
    expect(Array.from(dib.indices)).toEqual([3, 7, 1, 4, 9, 2]);
  });
});
