import type { AssetCatalog } from "@comic-chat/asset-manifest-types";
import { layoutPanelBalloons, type BalloonGeometryConfig, type BalloonRect, type Panel } from "@comic-chat/comic-engine";
import { useMemo } from "react";
import { Group, Image as KonvaImage, Layer, Rect, Stage, Text } from "react-konva";
import { backdropAssetUrl } from "../assets";
import { seededRng } from "../prng";
import { useImage } from "../useImage";
import { AvatarSprite } from "./AvatarSprite";
import { SpeechBubble } from "./SpeechBubble";

const PANEL_WIDTH = 300;
const BODY_HEIGHT = 220;
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
// 넉넉히 준다. 실제 캔버스 높이는 이 값이 아니라 아래에서 배치 결과를 보고 동적으로 정한다.
const BALLOON_AREA_BUDGET = 700;
const FONT_SIZE = 14;
const LINE_HEIGHT = FONT_SIZE * 1.3;
const BALLOON_MARGIN = 8;

// chat.rc의 IDS_DEFAULT_BACKDROP("room8bs")과 동일한 기본 배경.
const DEFAULT_BACKDROP_ID = "room8bs";

interface PanelCanvasProps {
  panel: Panel;
  actorNicks: ReadonlyMap<string, string>;
  catalog: AssetCatalog;
}

/**
 * panel.cpp의 CUnitPanel(여러 body + 여러 말풍선 하나의 장면) 렌더링 포팅.
 * 아바타는 동일한 폭의 칸에 좌우로 나눠 배치한다(panel/zoom.ts의 신장 정규화·줌 스냅까지
 * 반영한 정밀 배치는 Stage 3 이후 렌더링 고도화 과제로 남긴다 — 지금은 panel.bodies의
 * 좌우 순서/flip만 정확히 반영). 말풍선은 balloon/layout.ts의 layoutPanelBalloons로
 * 실제 겹침 없이 쌓고, 각 화자 칸의 중앙을 arrowX로 근사한다.
 */
export function PanelCanvas({ panel, actorNicks, catalog }: PanelCanvasProps) {
  const backdrop = catalog.backdrops.find((b) => b.backdropId === DEFAULT_BACKDROP_ID) ?? catalog.backdrops[0];
  const backdropImg = useImage(backdrop ? backdropAssetUrl(backdrop.imagePath) : null);

  const colWidth = PANEL_WIDTH / Math.max(1, panel.bodies.length);

  // 진짜 재현성(replay bit-exact)은 Stage 4에서 이벤트 payload에 랜덤 결과를 저장하는 방식으로
  // 확보한다 — 지금은 패널 내용 기반 시드로 리렌더링 때 값이 흔들리지 않게만 한다(prng.ts 참고).
  const rng = useMemo(
    () => seededRng(panel.balloons.map((b) => `${b.speakerActorId}:${b.text}`).join("|")),
    [panel],
  );

  const balloonSpecs = useMemo(
    () =>
      panel.balloons.map((balloon) => {
        const bodyIndex = panel.bodies.findIndex((b) => b.actorId === balloon.speakerActorId);
        const arrowX = bodyIndex >= 0 ? bodyIndex * colWidth + colWidth / 2 : PANEL_WIDTH / 2;
        return { text: balloon.text, mode: balloon.mode, arrowX };
      }),
    [panel, colWidth],
  );

  const freeRect: BalloonRect = {
    left: BALLOON_MARGIN,
    right: PANEL_WIDTH - BALLOON_MARGIN,
    top: BALLOON_AREA_BUDGET,
    bottom: 0,
  };
  const { placed, leftOver } = useMemo(
    () => layoutPanelBalloons(balloonSpecs, freeRect, FONT_SIZE, LINE_HEIGHT, rng, BALLOON_GEOMETRY),
    [balloonSpecs, rng],
  );

  // 실제로 쌓인 말풍선 분량만큼만 캔버스를 늘린다 — 고정 높이였다면 5개까지 쌓이는 말풍선이
  // 안 보이게 잘릴 수 있었다(실제로 이 문제를 겪고 나서 동적으로 바꿈).
  const contentBottom = placed.length > 0 ? Math.min(...placed.map((p) => p.bottom)) : freeRect.top;
  const balloonAreaHeight = Math.max(MIN_BALLOON_AREA_HEIGHT, freeRect.top - contentBottom + BALLOON_MARGIN * 2);
  const panelHeight = BODY_HEIGHT + balloonAreaHeight;
  const toKonvaY = (logicalY: number) => BALLOON_MARGIN + (freeRect.top - logicalY);

  return (
    <Stage width={PANEL_WIDTH} height={panelHeight}>
      <Layer>
        <Rect width={PANEL_WIDTH} height={panelHeight} fill="#ffffff" stroke="black" strokeWidth={2} />
        {backdropImg && (
          <KonvaImage image={backdropImg} x={0} y={panelHeight - BODY_HEIGHT} width={PANEL_WIDTH} height={BODY_HEIGHT} />
        )}
        {panel.bodies.map((body, i) => {
          const avatar = catalog.avatars.find((a) => a.characterId === body.characterId);
          if (!avatar) return null;
          return (
            <Group key={body.actorId} x={i * colWidth} y={panelHeight - BODY_HEIGHT}>
              <AvatarSprite avatar={avatar} pose={body.pose} width={colWidth} height={BODY_HEIGHT} flip={body.flip} />
              <Text text={actorNicks.get(body.actorId) ?? "?"} x={4} y={4} fontSize={11} fontStyle="bold" fill="#333" />
            </Group>
          );
        })}
        {placed.map((p) => {
          const spec = balloonSpecs[p.index]!;
          return (
            <SpeechBubble
              key={p.index}
              x={p.left}
              y={toKonvaY(p.top)}
              width={p.right - p.left}
              height={toKonvaY(p.bottom) - toKonvaY(p.top)}
              tailX={spec.arrowX - p.left}
              text={p.text}
              fontSize={FONT_SIZE}
            />
          );
        })}
        {leftOver && (
          <Text text={`(+ ${leftOver.length}자 더)`} x={BALLOON_MARGIN} y={4} fontSize={10} fill="#999" />
        )}
      </Layer>
    </Stage>
  );
}

export { PANEL_WIDTH };
