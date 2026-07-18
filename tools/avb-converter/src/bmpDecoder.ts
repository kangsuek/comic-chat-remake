// dib.cpp의 CDIB::Load + Convert4ToNonRLE 포팅.
// v1.0-pre 자산 실측 결과(Phase 2 스파이크) 캐릭터 아트는 1bpp BI_RGB, 배경/아이콘은
// 4bpp BI_RLE4만 사용한다 — BI_RLE8은 v1.0-pre 전체에서 쓰이지 않아 구현하지 않는다.

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface DecodedDib {
  width: number;
  height: number;
  palette: Rgb[];
  /** top-down, row-major, 픽셀당 팔레트 인덱스 1개 */
  indices: Uint8Array;
}

const BI_RGB = 0;
const BI_RLE4 = 2;

function align4(n: number): number {
  return (n + 3) & ~3;
}

/**
 * buf의 offset 위치에서 시작하는 BITMAPFILEHEADER+BITMAPINFOHEADER+팔레트+비트 블록을 디코드한다.
 * .avb 파일 안의 fgndOffset/transOffset/auraOffset가 가리키는 위치가 바로 이런 DIB 블록의 시작이다.
 */
export function decodeDibAt(buf: Buffer, offset: number): DecodedDib {
  const bfType = buf.readUInt16LE(offset);
  if (bfType !== 0x4d42) {
    throw new Error(`offset ${offset}: BITMAPFILEHEADER 시그니처('BM')가 아님`);
  }
  const bfSize = buf.readUInt32LE(offset + 2);
  const bfOffBits = buf.readUInt32LE(offset + 10);

  const biSize = buf.readUInt32LE(offset + 14);
  if (biSize !== 40) {
    throw new Error(`offset ${offset}: 지원하지 않는 BITMAPINFOHEADER 크기(${biSize}) — Windows 40바이트 헤더만 지원`);
  }
  const width = buf.readInt32LE(offset + 18);
  const height = buf.readInt32LE(offset + 22);
  const bitCount = buf.readUInt16LE(offset + 28);
  const compression = buf.readUInt32LE(offset + 30);

  if (bitCount !== 1 && bitCount !== 4) {
    throw new Error(`offset ${offset}: 지원하지 않는 bitCount(${bitCount}) — 1 또는 4만 지원`);
  }

  const numColors = bitCount === 1 ? 2 : 16;
  const palOffset = offset + 14 + biSize;
  const palette: Rgb[] = [];
  for (let i = 0; i < numColors; i++) {
    const p = palOffset + i * 4;
    palette.push({ b: buf.readUInt8(p), g: buf.readUInt8(p + 1), r: buf.readUInt8(p + 2) });
  }

  const bitsStart = offset + bfOffBits;
  const bitsSize = bfSize - bfOffBits;
  const rawBits = buf.subarray(bitsStart, bitsStart + bitsSize);

  let packed: Buffer;
  if (compression === BI_RGB) {
    packed = Buffer.from(rawBits);
  } else if (compression === BI_RLE4 && bitCount === 4) {
    packed = decodeRle4(rawBits, width, height);
  } else {
    throw new Error(`offset ${offset}: 지원하지 않는 compression(${compression})/bitCount(${bitCount}) 조합`);
  }

  const indices = bitCount === 1 ? unpack1bpp(packed, width, height) : unpack4bpp(packed, width, height);

  return { width, height, palette, indices };
}

/** DIB는 bottom-up + DWORD 정렬 스캔라인이므로, top-down 1바이트/픽셀 인덱스 배열로 펼친다. */
function unpack1bpp(bits: Buffer, width: number, height: number): Uint8Array {
  const storageWidth = align4(Math.ceil(width / 8));
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const srcRow = (height - 1 - y) * storageWidth;
    for (let x = 0; x < width; x++) {
      const byte = bits[srcRow + (x >> 3)] ?? 0;
      out[y * width + x] = (byte >> (7 - (x & 7))) & 1;
    }
  }
  return out;
}

function unpack4bpp(bits: Buffer, width: number, height: number): Uint8Array {
  const storageWidth = align4(Math.ceil(width / 2));
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const srcRow = (height - 1 - y) * storageWidth;
    for (let x = 0; x < width; x++) {
      const byte = bits[srcRow + (x >> 1)] ?? 0;
      out[y * width + x] = x & 1 ? byte & 0x0f : byte >> 4;
    }
  }
  return out;
}

/**
 * dib.cpp의 Convert4ToNonRLE/MyWrite 포팅: 니블 단위 run-length 인코딩을 해제한다.
 * - count>0: 다음 1바이트(니블 2개)를 count개 픽셀 동안 번갈아 반복(run)
 * - count==0, op==0: EOL — 출력 커서를 다음 4바이트 경계로 정렬
 * - count==0, op==1: EOB — 즉시 종료
 * - count==0, op==2: delta — dx,dy만큼 건너뛰며 팔레트 인덱스 0xFF(sentinel)로 채움
 * - count==0, op>=3: 다음 op개 픽셀을 니블 스트림에서 그대로 읽음(absolute), 워드 경계 패딩
 */
function decodeRle4(compressed: Buffer, width: number, height: number): Buffer {
  const scanLength = align4(Math.ceil(width / 2));
  const out = Buffer.alloc(scanLength * height);

  let src = 0;
  let dst = 0;
  let highRead = true;
  let highWrite = true;

  const readNibble = (advance: boolean): number => {
    let val: number;
    if (highRead) {
      val = compressed[src]! >> 4;
    } else {
      val = compressed[src]! & 0x0f;
      if (advance) src++;
    }
    highRead = !highRead;
    return val;
  };

  const writeNibble = (val: number): void => {
    if (highWrite) {
      out[dst] = val << 4;
    } else {
      out[dst]! |= val;
      dst++;
    }
    highWrite = !highWrite;
  };

  const copyNibble = (advance: boolean): void => writeNibble(readNibble(advance));

  while (src < compressed.length) {
    const count = compressed[src++]!;
    if (count > 0) {
      let remaining = count;
      while (remaining > 0) {
        copyNibble(false);
        remaining--;
        if (remaining === 0) break;
        copyNibble(false);
        remaining--;
      }
      src++; // run 데이터 1바이트 소비
      highRead = true;
    } else {
      const op = compressed[src++]!;
      if (op >= 3) {
        let remaining = op;
        while (remaining > 0) {
          copyNibble(true);
          remaining--;
          if (remaining === 0) break;
          copyNibble(true);
          remaining--;
        }
        if (src & 1) src++; // absolute 모드는 워드 경계로 패딩
        highRead = true;
      } else if (op === 0) {
        if (!highWrite) dst++; // 절반만 쓰인 바이트도 소비된 것으로 침
        dst = align4(dst);
        highWrite = true;
      } else if (op === 2) {
        const dx = compressed[src++]!;
        const dy = compressed[src++]!;
        const skip = dx + dy * scanLength - 1;
        for (let i = 0; i < skip; i++) out[dst++] = 0xff;
      } else if (op === 1) {
        break;
      }
    }
  }

  return out;
}

export function dibToRgba(dib: DecodedDib): Buffer {
  const out = Buffer.alloc(dib.width * dib.height * 4);
  for (let i = 0; i < dib.indices.length; i++) {
    const color = dib.palette[dib.indices[i]!]!;
    out[i * 4] = color.r;
    out[i * 4 + 1] = color.g;
    out[i * 4 + 2] = color.b;
    out[i * 4 + 3] = 255;
  }
  return out;
}
