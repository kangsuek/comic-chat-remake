import type { RngLike } from "@comic-chat/comic-engine";

/**
 * mulberry32 — 작고 빠른 시드 PRNG. 말풍선 크기/위치 같은 렌더링 시점 랜덤값에 쓴다.
 * plan.md의 설계상 진짜 재현성(replay bit-exact)은 이벤트 payload에 랜덤 "결과"를 저장하는
 * 방식으로 확보한다(Stage 4에서 배선). 지금은 그 전 단계라, 같은 패널 내용이면 리렌더링 때마다
 * 값이 흔들리지 않도록 패널 내용 기반 시드만으로 "일관된" 랜덤을 낸다 — 서버 재계산과
 * bit-exact 일치를 보장하진 않는다.
 */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return h >>> 0;
}

export function seededRng(seedText: string): RngLike {
  return { next: mulberry32(hashSeed(seedText)) };
}
