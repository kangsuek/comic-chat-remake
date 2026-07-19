import {
  layoutPanelBalloons,
  type BalloonGeometryConfig,
  type BalloonRect,
  type Panel,
  type PlacedBalloon,
  type SpeechMode,
} from "@comic-chat/comic-engine";
import { seededRng } from "./prng";

export const PANEL_WIDTH = 300;
export const BODY_HEIGHT = 220;
const MIN_BALLOON_AREA_HEIGHT = 140;
// balloon/layout.ts의 DEFAULT_BALLOON_GEOMETRY(oneLineThreshold=500, widthFudge=200,
// minHookHeight=100)는 원작의 ~2300-unit 패널 스케일에 맞춘 값이다. 이 패널은 그보다 훨씬
// 작은 스케일(maxWidth≈284)로 렌더링되므로, 그대로 쓰면 +200 fudge factor가 실제 텍스트
// 폭보다 훨씬 커져서 말풍선 폭이 텍스트 길이와 무관하게 거의 균일해진다(실제로 겪은 버그) —
// 원작 상수 대비 폭 비율(maxWidth/unitWidth≈0.13)로 스케일해 텍스트 길이에 비례하도록 맞춘다.
const BALLOON_GEOMETRY: Partial<BalloonGeometryConfig> = {
  oneLineThreshold: 60,
  minHookHeight: 12,
  widthFudge: 24,
  padding: 8,
};
// estimateBalloonSize의 potentialHeight 계산(긴 텍스트 분기에서만 쓰임 — 짧은 텍스트는
// len+widthFudge로 폭이 정해지므로 이 값과 무관하다)과, 말풍선이 몇 개까지 겹치지 않고
// 쌓일 수 있는지의 "여유 예산" 역할을 겸한다. 넉넉하게 잡아도 긴 텍스트 분기의 minWidth는
// estimateWidestWordWidth로 바닥이 잡혀 있어(단어 하나보다 좁아지지 않음) 폭이 균일해지는
// 문제는 재발하지 않는다 — 대신 한 패널 최대 5개 말풍선(panel.ts)이 다 쌓여도 잘리지 않게
// 넉넉히 준다. 실제 캔버스 높이는 이 값이 아니라 배치 결과를 보고 동적으로 정한다.
const BALLOON_AREA_BUDGET = 700;
export const FONT_SIZE = 14;
const LINE_HEIGHT = FONT_SIZE * 1.3;
const BALLOON_MARGIN = 8;

export interface BalloonSpec {
  text: string;
  mode: SpeechMode;
  arrowX: number;
}

export interface PanelBalloonLayout {
  balloonSpecs: BalloonSpec[];
  placed: PlacedBalloon[];
  leftOver: string | null;
  panelHeight: number;
  freeRectTop: number;
}

/**
 * PanelCanvas가 그리기 전에 필요한 모든 배치 계산(말풍선 폭/위치, 캔버스 높이)을 순수 함수로
 * 뽑아낸 것 — React/Konva에 의존하지 않아 재현성(같은 Panel 내용이면 항상 같은 결과)을
 * 직접 테스트할 수 있다. seed는 panel의 실제 내용(발화자+텍스트)에서만 유도하므로, 새로고침·
 * 재접속으로 다시 계산해도 항상 같은 값이 나온다(Stage 4: 이벤트 payload에 저장하는 대신,
 * 내용 기반 결정적 재계산으로 재현성을 확보 — plan.md의 "재계산 없이 저장된 값 사용" 원칙과는
 * 다르지만, "새로고침해도 동일한 결과"라는 실질적 목표는 동일하게 달성한다).
 */
export function computePanelBalloonLayout(panel: Panel): PanelBalloonLayout {
  const colWidth = PANEL_WIDTH / Math.max(1, panel.bodies.length);

  const rng = seededRng(panel.balloons.map((b) => `${b.speakerActorId}:${b.text}`).join("|"));

  const balloonSpecs: BalloonSpec[] = panel.balloons.map((balloon) => {
    const bodyIndex = panel.bodies.findIndex((b) => b.actorId === balloon.speakerActorId);
    const arrowX = bodyIndex >= 0 ? bodyIndex * colWidth + colWidth / 2 : PANEL_WIDTH / 2;
    return { text: balloon.text, mode: balloon.mode, arrowX };
  });

  const freeRect: BalloonRect = {
    left: BALLOON_MARGIN,
    right: PANEL_WIDTH - BALLOON_MARGIN,
    top: BALLOON_AREA_BUDGET,
    bottom: 0,
  };
  const { placed, leftOver } = layoutPanelBalloons(balloonSpecs, freeRect, FONT_SIZE, LINE_HEIGHT, rng, BALLOON_GEOMETRY);

  const contentBottom = placed.length > 0 ? Math.min(...placed.map((p) => p.bottom)) : freeRect.top;
  const balloonAreaHeight = Math.max(MIN_BALLOON_AREA_HEIGHT, freeRect.top - contentBottom + BALLOON_MARGIN * 2);
  const panelHeight = BODY_HEIGHT + balloonAreaHeight;

  return { balloonSpecs, placed, leftOver, panelHeight, freeRectTop: freeRect.top };
}

/** freeRect는 panel/zoom.ts와 동일한 Y-up 좌표계(top>bottom)라 Konva의 Y-down으로 뒤집는다. */
export function toKonvaY(logicalY: number, freeRectTop: number): number {
  return BALLOON_MARGIN + (freeRectTop - logicalY);
}
