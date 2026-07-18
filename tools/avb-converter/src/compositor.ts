// bodycam.cpp의 DrawBody가 쓰는 GDI 합성 순서(MERGEPAINT 2회 + SRCAND)를
// 알파 합성으로 치환한 것. Phase 2 스파이크에서 실제로 렌더링해 검증한 결과:
//   1) aura(확장 실루엣) 존재 시 항상 그 영역을 불투명 흰색으로("후광")
//   2) mask(실루엣) 존재 시, 아바타의 HEADMASK/TORSOMASK 플래그가 켜져 있을 때만 흰색으로
//   3) fgnd(흑백 잉크선) — 검은 픽셀은 항상 불투명 검정으로 덮어씀(SRCAND가 흰 배경은 통과시키므로)
// 최종적으로: 검은 잉크=불투명 검정 / (mask∪aura 영역의) 흰 배경=불투명 흰색 / 그 외=완전 투명.
import type { DecodedDib } from "./bmpDecoder.js";

function isDarkAt(dib: DecodedDib, x: number, y: number): boolean {
  const paletteIndex = dib.indices[y * dib.width + x]!;
  const c = dib.palette[paletteIndex]!;
  return c.r + c.g + c.b < 384; // 임계값 128*3 — 1bpp 흑백 팔레트 기준으로 충분
}

/**
 * bodycam.cpp의 DrawBody는 fgnd/mask/aura를 각자의 원본 픽셀 크기와 무관하게 동일한
 * 목적지 사각형(StretchDIBits)에 맞춰 그린다 — 즉 세 레이어의 원본 해상도가 달라도 된다.
 * 실측 결과 일부 포즈에서 실제로 mask/aura 크기가 fgnd와 몇 픽셀 차이 나, 최근접 이웃으로
 * fgnd 크기에 맞춰 리샘플링한다(원작 STRETCH_HALFTONE의 부드러운 보간까지는 재현하지 않음 —
 * 1비트 흑백 실루엣이라 이 정도 차이에서 시각적으로 무의미).
 */
function isDarkResampled(dib: DecodedDib, x: number, y: number, targetWidth: number, targetHeight: number): boolean {
  const srcX = Math.min(dib.width - 1, Math.floor((x * dib.width) / targetWidth));
  const srcY = Math.min(dib.height - 1, Math.floor((y * dib.height) / targetHeight));
  return isDarkAt(dib, srcX, srcY);
}

export interface CompositePoseInput {
  fgnd: DecodedDib;
  mask: DecodedDib | null;
  aura: DecodedDib | null;
  /** 아바타 레벨 HEADMASK/TORSOMASK 플래그 — 꺼져 있으면 mask가 있어도 적용하지 않는다. */
  useMask: boolean;
}

export interface CompositedPose {
  width: number;
  height: number;
  rgba: Buffer;
}

export function compositePose({ fgnd, mask, aura, useMask }: CompositePoseInput): CompositedPose {
  const { width, height } = fgnd;
  const rgba = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const ink = isDarkAt(fgnd, x, y);
      const auraDark = aura !== null && isDarkResampled(aura, x, y, width, height);
      const maskDark = useMask && mask !== null && isDarkResampled(mask, x, y, width, height);
      const forcedWhite = auraDark || maskDark;

      const o = i * 4;
      if (ink) {
        rgba[o] = 0;
        rgba[o + 1] = 0;
        rgba[o + 2] = 0;
        rgba[o + 3] = 255;
      } else if (forcedWhite) {
        rgba[o] = 255;
        rgba[o + 1] = 255;
        rgba[o + 2] = 255;
        rgba[o + 3] = 255;
      } else {
        rgba[o + 3] = 0; // 나머지는 0으로 이미 초기화됨(Buffer.alloc) — 완전 투명
      }
    }
  }

  return { width, height, rgba };
}
