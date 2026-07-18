// bodycam.cpp의 CBodyDouble::GetBodyBox / CBodySingle::GetBodyBox 포팅.
// 목적지 사각형(예: 패널의 바디캠 영역)을 (0,0) 원점의 로컬 좌표로 받아, 그 안에 아바타를
// 비율 유지 축소·하단 중앙 정렬로 배치한 결과를 돌려준다. 실제 화면 좌표로 옮기는 건
// 호출부(Konva Group의 x/y)의 몫이다 — 이 함수 자체는 오프셋 없이 계산해도 결과가 같다
// (원작의 clientRect.left/top 오프셋은 Group 변환과 등가).
export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ComplexBodyBoxInput {
  torsoWidth: number;
  torsoHeight: number;
  torsoXCX: number;
  torsoYCX: number;
  faceWidth: number;
  faceHeight: number;
  faceXCX: number;
  faceYCX: number;
  faceDeltaXCX: number;
  faceDeltaYCX: number;
  clientWidth: number;
  clientHeight: number;
}

export interface ComplexBodyBoxResult {
  torso: Rect;
  head: Rect;
}

/** Complex(얼굴+몸통 분리) 아바타의 상대 배치. vector2d.h의 ROUND(fp)=(int)(fp+0.5) 포팅. */
export function computeComplexBodyBox(input: ComplexBodyBoxInput): ComplexBodyBoxResult {
  const xOffset = input.torsoXCX + input.faceDeltaXCX - input.faceXCX;
  const yOffset = input.torsoYCX + input.faceDeltaYCX - input.faceYCX;

  const bitLeft = Math.min(0, xOffset);
  const bitRight = Math.max(input.torsoWidth, xOffset + input.faceWidth);
  const bitTop = Math.min(0, yOffset);
  const bitBottom = Math.max(input.torsoHeight, yOffset + input.faceHeight);

  const bitWidth = bitRight - bitLeft;
  const bitHeight = bitBottom - bitTop;

  const widthScale = input.clientWidth / bitWidth;
  const heightScale = input.clientHeight / bitHeight;
  const scale = Math.min(widthScale, heightScale);

  const fullWidth = Math.round(scale * bitWidth);
  const fullHeight = Math.round(scale * bitHeight);

  const fullLeft = (input.clientWidth - fullWidth) / 2;
  const fullTop = input.clientHeight - fullHeight; // 하단 정렬

  return {
    head: {
      left: Math.round((xOffset - bitLeft) * scale) + fullLeft,
      top: Math.round((yOffset - bitTop) * scale) + fullTop,
      width: Math.round(input.faceWidth * scale) + 1,
      height: Math.round(input.faceHeight * scale) + 1,
    },
    torso: {
      left: Math.round((0 - bitLeft) * scale) + fullLeft,
      top: Math.round((0 - bitTop) * scale) + fullTop,
      width: Math.round(input.torsoWidth * scale) + 1,
      height: Math.round(input.torsoHeight * scale) + 1,
    },
  };
}

export interface SimpleBodyBoxInput {
  bodyWidth: number;
  bodyHeight: number;
  clientWidth: number;
  clientHeight: number;
}

/**
 * Simple(단일 스프라이트) 아바타 배치. 원작은 이 경로에서 (int) 캐스팅(0방향 절삭)을 쓰고
 * Complex 경로만 ROUND를 쓰는 비대칭이 있다 — 원작 그대로 Math.trunc으로 포팅한다
 * (실질적으로 1px 이하 차이라 화면상 의미는 없지만, 정확한 포팅 원칙을 지킨다).
 */
export function computeSimpleBodyBox(input: SimpleBodyBoxInput): Rect {
  const widthScale = input.clientWidth / input.bodyWidth;
  const heightScale = input.clientHeight / input.bodyHeight;

  let fullWidth: number;
  let fullHeight: number;
  if (widthScale <= heightScale) {
    fullWidth = input.clientWidth;
    fullHeight = Math.trunc(widthScale * input.bodyHeight);
  } else {
    fullHeight = input.clientHeight;
    fullWidth = Math.trunc(heightScale * input.bodyWidth);
  }

  return {
    left: (input.clientWidth - fullWidth) / 2,
    top: input.clientHeight - fullHeight,
    width: fullWidth,
    height: fullHeight,
  };
}
