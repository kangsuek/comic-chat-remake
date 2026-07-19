// panel.cpp의 GetCloudEstimate/LayoutBalloon/LayoutBalloons와 balloon.cpp의
// AreaEstimate/WidestWord/SplitHeight를 포팅. 원작은 실제 GDI 텍스트 측정(dc->GetTextExtent)에
// 의존하지만 서버/공용 코드에는 DOM/Canvas가 없어 text/textMetrics.ts의 근사치를 쓴다.
//
// 좌표계는 panel/zoom.ts와 동일(Y가 위로 갈수록 증가, top > bottom).
// route-region(꼬리 경로) 충돌 회피(GetInterveningBBox/AdjustRouteRgns)는 스플라인 좌표계에
// 강하게 결합된 복잡한 기하 로직이라 포팅하지 않는다 — docs/phases/03에 이미 명시된 대로,
// "겹치면 아래로 밀어낸다"는 단순한 현대적 재구현으로 대체한다: 말풍선을 순서대로 하나씩,
// 항상 이전 말풍선들이 끝난 지점부터 시작해 쌓으면(같은 Y구간을 재사용하지 않으면) 애초에
// 겹칠 일이 없다 — "겹치면 밀어낸다"를 "애초에 겹치지 않게 쌓는다"로 단순화한 것과 동치다.
import { estimateTextWidth, estimateWidestWordWidth, estimateWrappedLineCount, splitTextToFit } from "../text/textMetrics.js";
import type { SpeechMode } from "../panel/types.js";

export interface RngLike {
  /** [0,1) 범위의 다음 난수. 시드/저장 방식은 호출자가 결정한다(plan.md: 이벤트별로 한 번 계산해 payload에 저장, replay는 재계산 없음). */
  next(): number;
}

export interface BalloonRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface BalloonGeometryConfig {
  /** 이 폭 이하면 한 줄로 확정폭(원작 ONELINETHRESHOLD=500). */
  oneLineThreshold: number;
  /** 말풍선과 화자 사이 최소 여유(원작 MINHOOKHEIGHT=100). */
  minHookHeight: number;
  /** goalWidth 계산의 여유분(원작의 "+200 fudge factor"). */
  widthFudge: number;
  /** 말풍선 내부 여백. */
  padding: number;
}

export const DEFAULT_BALLOON_GEOMETRY: BalloonGeometryConfig = {
  oneLineThreshold: 500,
  minHookHeight: 100,
  widthFudge: 200,
  padding: 20,
};

export interface BalloonSizeInput {
  text: string;
  mode: SpeechMode;
  /** 화자의 arrowX(panel/zoom.ts의 BodyBox.arrowX) — 말풍선이 항상 이 x를 덮도록 배치된다. */
  arrowX: number;
  freeRect: BalloonRect;
  /** 이 패널에서 이미 배치된 이전 말풍선들의 bottom(순서 무관) — potentialHeight 계산에 쓰인다. */
  previousBottoms: readonly number[];
  fontSize: number;
  rng: RngLike;
  geometry?: Partial<BalloonGeometryConfig>;
}

export interface BalloonSize {
  width: number;
  left: number;
  right: number;
}

/**
 * GetCloudEstimate 포팅. 텍스트 폭이 oneLineThreshold 이하면 그 폭 그대로(랜덤 없음, 한 줄).
 * 넘으면 minWidth(가용 높이 기준 면적 역산, 가장 넓은 단어 이상 보장)~maxWidth 사이 랜덤폭을
 * 목표로 삼는다. X 위치는 항상 arrowX를 덮도록 [arrowX-goalWidth, arrowX] 범위에서 랜덤
 * 배치 후 freeRect 안으로 클램프한다. action(박스) 모드는 화자 anchor 없이 freeRect 왼쪽에 붙는다.
 */
export function estimateBalloonSize(input: BalloonSizeInput): BalloonSize {
  const geometry = { ...DEFAULT_BALLOON_GEOMETRY, ...input.geometry };
  const { text, mode, arrowX, freeRect, previousBottoms, fontSize, rng } = input;

  const len = estimateTextWidth(text, fontSize);
  const maxWidth = Math.max(1, freeRect.right - freeRect.left);

  let goalWidth: number;
  if (len <= geometry.oneLineThreshold) {
    goalWidth = len;
  } else {
    // canBeTall 분기는 원작에서 NoneToLeft() 호출이 주석 처리되어 사실상 항상 true다
    // (docs/phases/03의 스파이크 결과 참고) — else(세로로 길게) 분기는 죽은 코드라 포팅하지 않는다.
    const lowestPreviousBottom = previousBottoms.length > 0 ? Math.min(...previousBottoms) : freeRect.top;
    const potentialHeight = Math.max(1, lowestPreviousBottom - freeRect.bottom + geometry.minHookHeight);
    const lineHeight = fontSize * 1.3; // AreaEstimate의 dwExtent.cy 근사(단일 줄 렌더 높이 ≈ lineHeight)
    const area = 1.3 * len * (lineHeight + lineHeight);
    let minWidth = area / potentialHeight;
    minWidth = Math.max(minWidth, estimateWidestWordWidth(text, fontSize));
    goalWidth = minWidth + rng.next() * (maxWidth - minWidth);
  }

  goalWidth = Math.min(goalWidth + geometry.widthFudge, maxWidth);
  goalWidth = Math.min(goalWidth, len + geometry.widthFudge);
  goalWidth = Math.max(goalWidth, 1);

  let left: number;
  if (mode === "action") {
    left = freeRect.left;
  } else {
    const leftLimit = arrowX - goalWidth;
    const rightLimit = arrowX;
    let startX = leftLimit + rng.next() * (rightLimit - leftLimit);
    if (startX < freeRect.left) startX = freeRect.left;
    if (startX + goalWidth > freeRect.right) startX = freeRect.right - goalWidth;
    left = startX;
  }

  return { width: goalWidth, left, right: left + goalWidth };
}

export interface BalloonSpec {
  text: string;
  mode: SpeechMode;
  arrowX: number;
}

export interface PlacedBalloon extends BalloonRect {
  index: number;
  /** splitTextToFit로 잘렸다면 실제로 배치된(잘린) 텍스트. 안 잘렸으면 원문과 같다. */
  text: string;
}

export interface BalloonPlacementResult {
  placed: PlacedBalloon[];
  /**
   * 끝까지 다 못 들어간 말풍선의 나머지 텍스트(원작의 leftOver) — null이면 전부 들어갔다는 뜻.
   * 있으면 호출자가 이 텍스트를 새 패널의 다음 이벤트로 이어붙인다(panel.cpp의 AddLine 재귀와 동일한 역할).
   */
  leftOver: string | null;
}

/**
 * panel.cpp의 LayoutBalloons 포팅: 여러 말풍선을 순서대로 쌓는다. 각 말풍선은 지금까지 쌓인
 * 말풍선들보다 항상 아래(freeRect.bottom 방향)에 배치되므로 서로 겹치지 않는다(단순화된 충돌
 * 회피 — route-region 기하 대신 "애초에 같은 세로 구간을 쓰지 않는다"로 대체, 위 모듈 설명 참고).
 * 마지막 말풍선이 freeRect 안에 다 안 들어가면 splitTextToFit으로 강제로 잘라 leftOver를 돌려준다
 * (원작 ForceFitBalloon+SplitHeight 대응, 첫 말풍선이 통째로 안 들어가는 경우도 포함).
 */
export function layoutPanelBalloons(
  balloons: readonly BalloonSpec[],
  freeRect: BalloonRect,
  fontSize: number,
  lineHeight: number,
  rng: RngLike,
  geometry?: Partial<BalloonGeometryConfig>,
): BalloonPlacementResult {
  const placed: PlacedBalloon[] = [];
  let cursorTop = freeRect.top;

  for (let i = 0; i < balloons.length; i++) {
    const spec = balloons[i]!;
    const size = estimateBalloonSize({
      text: spec.text,
      mode: spec.mode,
      arrowX: spec.arrowX,
      freeRect,
      previousBottoms: placed.map((p) => p.bottom),
      fontSize,
      rng,
      geometry,
    });

    const innerWidth = Math.max(1, size.width - (geometry?.padding ?? DEFAULT_BALLOON_GEOMETRY.padding) * 2);
    const availableHeight = cursorTop - freeRect.bottom;
    const maxLines = Math.max(0, Math.floor(availableHeight / lineHeight));
    const split = splitTextToFit(spec.text, innerWidth, maxLines, fontSize);

    if (split.fitted.length === 0) {
      // 이 말풍선은 이 지점부터 한 글자도 못 들어간다 — 이 말풍선 전체(및 이후 전부)가 leftOver.
      return { placed, leftOver: joinLeftOver(spec.text, balloons.slice(i + 1)) };
    }

    const lines = estimateWrappedLineCount(split.fitted, innerWidth, fontSize);
    const height = lines * lineHeight + (geometry?.padding ?? DEFAULT_BALLOON_GEOMETRY.padding) * 2;
    const top = cursorTop;
    const bottom = top - height;

    placed.push({ index: i, text: split.fitted, left: size.left, right: size.right, top, bottom });
    cursorTop = bottom;

    if (split.leftOver) {
      return { placed, leftOver: joinLeftOver(split.leftOver, balloons.slice(i + 1)) };
    }
  }

  return { placed, leftOver: null };
}

function joinLeftOver(firstLeftOver: string, rest: readonly BalloonSpec[]): string {
  return [firstLeftOver, ...rest.map((b) => b.text)].join(" ");
}
