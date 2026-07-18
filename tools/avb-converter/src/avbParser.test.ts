import { describe, expect, it } from "vitest";
import { parseAvb } from "./avbParser.js";

const AK_NAME = 1;
const AK_FLAGS = 2;
const AK_ICON = 3;
const AK_NFACES = 4;
const AK_NTORSOS = 5;
const AK_STARTDATA = 6;
const AK_NBODIES = 9;

/** avbParser.ts가 기대하는 태그 스트림을 손으로 조립하는 헬퍼. */
class BufferWriter {
  private chunks: number[] = [];
  i16(v: number): this {
    const b = Buffer.alloc(2);
    b.writeInt16LE(v, 0);
    this.chunks.push(...b);
    return this;
  }
  u32(v: number): this {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(v, 0);
    this.chunks.push(...b);
    return this;
  }
  u8(v: number): this {
    this.chunks.push(v & 0xff);
    return this;
  }
  cstr(s: string): this {
    for (const ch of s) this.chunks.push(ch.charCodeAt(0));
    this.chunks.push(0);
    return this;
  }
  padding(n = 16): this {
    for (let i = 0; i < n; i++) this.chunks.push(0);
    return this;
  }
  build(): Buffer {
    return Buffer.from(this.chunks);
  }
}

function faceRecord(
  w: BufferWriter,
  fg: number,
  tr: number,
  au: number,
  emotionIdx: number,
  intensityByte: number,
  xCX: number,
  yCX: number,
  deltaXCX: number,
  deltaYCX: number,
  faceX: number,
  faceY: number,
): void {
  w.u32(fg).u32(tr).u32(au).i16(emotionIdx).u8(intensityByte);
  w.i16(xCX).i16(yCX).i16(deltaXCX).i16(deltaYCX).i16(faceX).i16(faceY);
  w.padding();
}

function torsoRecord(
  w: BufferWriter,
  fg: number,
  tr: number,
  au: number,
  emotionIdx: number,
  intensityByte: number,
  xCX: number,
  yCX: number,
): void {
  w.u32(fg).u32(tr).u32(au).i16(emotionIdx).u8(intensityByte);
  w.i16(xCX).i16(yCX);
  w.padding();
}

describe("parseAvb — complex 아바타", () => {
  it("헤더/태그/ditto/플래그를 정확히 파싱한다", () => {
    const w = new BufferWriter();
    w.i16(0x81).i16(2).i16(1); // magic, avType=COMPLEX, version
    w.i16(AK_NAME).cstr("Foo");
    w.i16(AK_FLAGS).i16(5); // HEADMASK(1) | TORSOFIRST(4)
    w.i16(AK_ICON).u32(999);
    w.i16(AK_NFACES).i16(2);
    faceRecord(w, 100, 200, 300, 1 /* HAPPY */, 255, 10, 20, 1, 2, 5, 6);
    faceRecord(w, 100 /* ditto */, 9999, 9999, 7 /* SHOUT */, 128, 11, 21, 3, 4, 7, 8);
    w.i16(AK_NTORSOS).i16(1);
    torsoRecord(w, 400, 0, 500, 9 /* NEUTRAL */, 0, 50, 60);
    w.i16(AK_STARTDATA);

    const av = parseAvb(w.build());
    if (av.kind !== "complex") throw new Error("expected complex");

    expect(av.name).toBe("Foo");
    expect(av.flags).toBe(5);
    expect(av.headMask).toBe(true);
    expect(av.torsoMask).toBe(false);
    expect(av.torsoFirst).toBe(true);

    expect(av.iconPoseIndex).toBe(0);
    expect(av.poseOffsets).toEqual([
      { fgndOffset: 999, transOffset: 0, auraOffset: 0 },
      { fgndOffset: 100, transOffset: 200, auraOffset: 300 },
      { fgndOffset: 400, transOffset: 0, auraOffset: 500 },
    ]);

    expect(av.faces).toHaveLength(2);
    expect(av.faces[0]).toMatchObject({
      poseIndex: 1,
      emotion: "HAPPY",
      intensity: 1,
      xCX: 10,
      yCX: 20,
      deltaXCX: 1,
      deltaYCX: 2,
      faceX: 5,
      faceY: 6,
    });
    // ditto: fgndOffset이 직전과 같으므로 poseOffsets에 새로 등록되지 않고 poseIndex 재사용
    expect(av.faces[1]).toMatchObject({ poseIndex: 1, emotion: "SHOUT", intensity: 128 / 255 });

    expect(av.torsos).toEqual([{ poseIndex: 2, emotion: "NEUTRAL", intensity: 0, xCX: 50, yCX: 60 }]);
  });

  it("magic이 틀리면 에러를 던진다", () => {
    const w = new BufferWriter();
    w.i16(0x99).i16(2).i16(1);
    expect(() => parseAvb(w.build())).toThrow(/magic/);
  });
});

describe("parseAvb — simple 아바타", () => {
  it("NBODIES를 파싱한다", () => {
    const w = new BufferWriter();
    w.i16(0x81).i16(1).i16(1); // magic, avType=SIMPLE, version
    w.i16(AK_NAME).cstr("Tux");
    w.i16(AK_NBODIES).i16(1);
    w.u32(700).u32(0).u32(0).i16(10 /* WAVE */).u8(255);
    w.i16(15).i16(16); // faceX, faceY
    w.padding();
    w.i16(AK_STARTDATA);

    const av = parseAvb(w.build());
    if (av.kind !== "simple") throw new Error("expected simple");

    expect(av.name).toBe("Tux");
    expect(av.bodies).toEqual([{ poseIndex: 0, emotion: "WAVE", intensity: 1, faceX: 15, faceY: 16 }]);
  });
});
