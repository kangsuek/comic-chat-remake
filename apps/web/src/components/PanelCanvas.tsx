import type { AssetCatalog } from "@comic-chat/asset-manifest-types";
import type { Panel } from "@comic-chat/comic-engine";
import { useMemo } from "react";
import { Group, Image as KonvaImage, Layer, Rect, Stage, Text } from "react-konva";
import { backdropAssetUrl } from "../assets";
import { BODY_HEIGHT, FONT_SIZE, PANEL_WIDTH, computePanelBalloonLayout, toKonvaY } from "../panelBalloonLayout";
import { useImage } from "../useImage";
import { AvatarSprite } from "./AvatarSprite";
import { SpeechBubble } from "./SpeechBubble";

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
 * 좌우 순서/flip만 정확히 반영). 말풍선 폭/위치 계산은 ../panelBalloonLayout.ts로 뽑아내
 * React/Konva 없이도 재현성(같은 패널 내용 → 같은 배치)을 테스트할 수 있게 했다.
 */
export function PanelCanvas({ panel, actorNicks, catalog }: PanelCanvasProps) {
  const backdrop = catalog.backdrops.find((b) => b.backdropId === DEFAULT_BACKDROP_ID) ?? catalog.backdrops[0];
  const backdropImg = useImage(backdrop ? backdropAssetUrl(backdrop.imagePath) : null);

  const colWidth = PANEL_WIDTH / Math.max(1, panel.bodies.length);
  const { balloonSpecs, placed, leftOver, panelHeight, freeRectTop } = useMemo(
    () => computePanelBalloonLayout(panel),
    [panel],
  );

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
              y={toKonvaY(p.top, freeRectTop)}
              width={p.right - p.left}
              height={toKonvaY(p.bottom, freeRectTop) - toKonvaY(p.top, freeRectTop)}
              tailX={spec.arrowX - p.left}
              text={p.text}
              fontSize={FONT_SIZE}
              mode={spec.mode}
            />
          );
        })}
        {leftOver && (
          <Text text={`(+ ${leftOver.length}자 더)`} x={8} y={4} fontSize={10} fill="#999" />
        )}
      </Layer>
    </Stage>
  );
}

export { PANEL_WIDTH };
