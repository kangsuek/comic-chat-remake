// avatario.cpp의 LoadAvatar/LoadBasics/LoadFaceRecs/LoadTorsoRecs/LoadBodyRecs 포팅.
// Phase 2 스파이크에서 22개 실제 .avb 파일로 바이트 레이아웃을 검증했다.
import type { EmotionId } from "@comic-chat/comic-engine";

const AF_MAGICNUM = 0x81;
const AK_NAME = 1;
const AK_FLAGS = 2;
const AK_ICON = 3;
const AK_NFACES = 4;
const AK_NTORSOS = 5;
const AK_STARTDATA = 6;
const AK_STYLE = 8;
const AK_NBODIES = 9;

const AT_SIMPLE = 1;
const AT_COMPLEX = 2;

// avatar.h: HEADMASK=1, TORSOMASK=2, TORSOFIRST=4 (Avatar flags)
const HEADMASK = 1;
const TORSOMASK = 2;
const TORSOFIRST = 4;

// avatario.cpp의 emFloats[] 순서 그대로 포팅. index 0은 원작에서 실사용되지 않는 슬롯이라
// 방어적으로 NEUTRAL 처리한다("neutral always safe" — EmotionToBytes 주석과 동일한 관례).
const EMOTION_BY_FILE_INDEX: EmotionId[] = [
  "NEUTRAL",
  "HAPPY",
  "COY",
  "BORED",
  "SCARED",
  "SAD",
  "ANGRY",
  "SHOUT",
  "LAUGH",
  "NEUTRAL",
  "WAVE",
  "POINTOTHER",
  "POINTSELF",
  "DOUBLEPOINT",
  "SHRUG",
  "3QRWALK",
  "SIDEWALK",
  "3QFWALK",
];

function emotionFromFileIndex(index: number): EmotionId {
  return EMOTION_BY_FILE_INDEX[index] ?? "NEUTRAL";
}

/** 포즈 하나의 실제 픽셀 데이터가 위치한 파일 내 절대 오프셋 3종. */
export interface PoseFileOffsets {
  fgndOffset: number;
  transOffset: number;
  auraOffset: number;
}

export interface FaceRecord {
  poseIndex: number;
  emotion: EmotionId;
  intensity: number;
  xCX: number;
  yCX: number;
  deltaXCX: number;
  deltaYCX: number;
  faceX: number;
  faceY: number;
}

export interface TorsoRecord {
  poseIndex: number;
  emotion: EmotionId;
  intensity: number;
  xCX: number;
  yCX: number;
}

export interface SimpleBodyRecord {
  poseIndex: number;
  emotion: EmotionId;
  intensity: number;
  faceX: number;
  faceY: number;
}

interface ParsedAvatarBase {
  name: string;
  style: number;
  flags: number;
  headMask: boolean;
  torsoMask: boolean;
  torsoFirst: boolean;
  iconPoseIndex: number | null;
  /** ditto(연속 offset 동일) 제거 후의 고유 포즈 목록. FaceRecord/TorsoRecord/SimpleBodyRecord의 poseIndex가 이 배열의 인덱스다. */
  poseOffsets: PoseFileOffsets[];
}

export type ParsedAvatar =
  | (ParsedAvatarBase & { kind: "complex"; faces: FaceRecord[]; torsos: TorsoRecord[] })
  | (ParsedAvatarBase & { kind: "simple"; bodies: SimpleBodyRecord[] });

class Cursor {
  pos = 0;
  constructor(private readonly buf: Buffer) {}
  i16(): number {
    const v = this.buf.readInt16LE(this.pos);
    this.pos += 2;
    return v;
  }
  u16(): number {
    const v = this.buf.readUInt16LE(this.pos);
    this.pos += 2;
    return v;
  }
  u32(): number {
    const v = this.buf.readUInt32LE(this.pos);
    this.pos += 4;
    return v;
  }
  u8(): number {
    const v = this.buf.readUInt8(this.pos);
    this.pos += 1;
    return v;
  }
  skip(n: number): void {
    this.pos += n;
  }
  cstr(maxLen = 64): string {
    let s = "";
    for (let i = 0; i < maxLen; i++) {
      const c = this.u8();
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s;
  }
}

export function parseAvb(buf: Buffer): ParsedAvatar {
  const c = new Cursor(buf);
  const magic = c.u16();
  if (magic !== AF_MAGICNUM) {
    throw new Error(`올바른 .avb 파일이 아님 (magic=0x${magic.toString(16)})`);
  }
  const avType = c.u16();
  c.u16(); // version — 파싱에 사용하지 않음

  let name = "";
  let style = 0;
  let flags = 0;
  let iconPoseIndex: number | null = null;
  let faces: FaceRecord[] | undefined;
  let torsos: TorsoRecord[] | undefined;
  let bodies: SimpleBodyRecord[] | undefined;

  const poseOffsets: PoseFileOffsets[] = [];
  const registerPose = (fgndOffset: number, transOffset: number, auraOffset: number): number => {
    poseOffsets.push({ fgndOffset, transOffset, auraOffset });
    return poseOffsets.length - 1;
  };

  let lastFaceOffset = 0;
  let lastTorsoOffset = 0;
  let lastBodyOffset = 0;

  while (true) {
    const key = c.u16();
    if (key === AK_NAME) {
      name = c.cstr();
    } else if (key === AK_STYLE) {
      style = c.u16();
    } else if (key === AK_FLAGS) {
      flags = c.u16();
    } else if (key === AK_ICON) {
      const fg = c.u32();
      iconPoseIndex = registerPose(fg, 0, 0);
    } else if (key === AK_NFACES) {
      const n = c.u16();
      faces = [];
      for (let i = 0; i < n; i++) {
        const fg = c.u32();
        const tr = c.u32();
        const au = c.u32();
        const poseIndex = fg !== lastFaceOffset ? registerPose(fg, tr, au) : faces[i - 1]!.poseIndex;
        lastFaceOffset = fg;
        const emotion = emotionFromFileIndex(c.i16());
        const intensity = c.u8() / 255;
        const xCX = c.i16();
        const yCX = c.i16();
        const deltaXCX = c.i16();
        const deltaYCX = c.i16();
        const faceX = c.i16();
        const faceY = c.i16();
        c.skip(16); // padding
        faces.push({ poseIndex, emotion, intensity, xCX, yCX, deltaXCX, deltaYCX, faceX, faceY });
      }
    } else if (key === AK_NTORSOS) {
      const n = c.u16();
      torsos = [];
      for (let i = 0; i < n; i++) {
        const fg = c.u32();
        const tr = c.u32();
        const au = c.u32();
        const poseIndex = fg !== lastTorsoOffset ? registerPose(fg, tr, au) : torsos[i - 1]!.poseIndex;
        lastTorsoOffset = fg;
        const emotion = emotionFromFileIndex(c.i16());
        const intensity = c.u8() / 255;
        const xCX = c.i16();
        const yCX = c.i16();
        c.skip(16); // padding
        torsos.push({ poseIndex, emotion, intensity, xCX, yCX });
      }
    } else if (key === AK_NBODIES) {
      const n = c.u16();
      bodies = [];
      for (let i = 0; i < n; i++) {
        const fg = c.u32();
        const tr = c.u32();
        const au = c.u32();
        const poseIndex = fg !== lastBodyOffset ? registerPose(fg, tr, au) : bodies[i - 1]!.poseIndex;
        lastBodyOffset = fg;
        const emotion = emotionFromFileIndex(c.i16());
        const intensity = c.u8() / 255;
        const faceX = c.i16();
        const faceY = c.i16();
        c.skip(16); // padding
        bodies.push({ poseIndex, emotion, intensity, faceX, faceY });
      }
    } else if (key === AK_STARTDATA) {
      break;
    } else {
      throw new Error(`알 수 없는 태그 key=${key} (pos=${c.pos - 2})`);
    }
  }

  const base: ParsedAvatarBase = {
    name,
    style,
    flags,
    headMask: (flags & HEADMASK) !== 0,
    torsoMask: (flags & TORSOMASK) !== 0,
    torsoFirst: (flags & TORSOFIRST) !== 0,
    iconPoseIndex,
    poseOffsets,
  };

  if (avType === AT_COMPLEX) {
    if (!faces || !torsos) throw new Error(`${name}: complex 아바타에 얼굴/몸통 레코드가 없음`);
    return { ...base, kind: "complex", faces, torsos };
  }
  if (avType === AT_SIMPLE) {
    if (!bodies) throw new Error(`${name}: simple 아바타에 몸 레코드가 없음`);
    return { ...base, kind: "simple", bodies };
  }
  throw new Error(`알 수 없는 avType=${avType}`);
}
