import type { AssetCatalog } from "@comic-chat/asset-manifest-types";
import type { HistoryEntry } from "@comic-chat/protocol";
import { Group, Image as KonvaImage, Layer, Rect, Stage, Text } from "react-konva";
import { backdropAssetUrl } from "../assets";
import { useImage } from "../useImage";
import { AvatarSprite } from "./AvatarSprite";
import { SpeechBubble } from "./SpeechBubble";

const PANEL_WIDTH = 300;
const PANEL_HEIGHT = 360;
const BODY_HEIGHT = 280;
const BUBBLE_WIDTH = PANEL_WIDTH - 32;

// chat.rc의 IDS_DEFAULT_BACKDROP("room8bs")과 동일한 기본 배경.
const DEFAULT_BACKDROP_ID = "room8bs";

interface PanelCanvasProps {
  entry: HistoryEntry;
  catalog: AssetCatalog;
}

/** 메시지 하나 = 패널 하나(Phase 2 범위). 패널 클론/멀티 캐릭터 배치는 Phase 3. */
export function PanelCanvas({ entry, catalog }: PanelCanvasProps) {
  const avatar = catalog.avatars.find((a) => a.characterId === entry.characterId);
  const backdrop = catalog.backdrops.find((b) => b.backdropId === DEFAULT_BACKDROP_ID) ?? catalog.backdrops[0];
  const backdropImg = useImage(backdrop ? backdropAssetUrl(backdrop.imagePath) : null);

  if (!avatar) return null;

  return (
    <Stage width={PANEL_WIDTH} height={PANEL_HEIGHT}>
      <Layer>
        <Rect width={PANEL_WIDTH} height={PANEL_HEIGHT} fill="#ffffff" stroke="black" strokeWidth={2} />
        {backdropImg && (
          <KonvaImage image={backdropImg} x={0} y={PANEL_HEIGHT - BODY_HEIGHT} width={PANEL_WIDTH} height={BODY_HEIGHT} />
        )}
        <Group y={PANEL_HEIGHT - BODY_HEIGHT}>
          <AvatarSprite avatar={avatar} pose={entry.pose} width={PANEL_WIDTH} height={BODY_HEIGHT} />
        </Group>
        <SpeechBubble x={16} y={8} width={BUBBLE_WIDTH} text={entry.text} />
        <Text
          text={entry.nick}
          x={16}
          y={PANEL_HEIGHT - BODY_HEIGHT + 4}
          fontSize={12}
          fontStyle="bold"
          fill="#333"
        />
      </Layer>
    </Stage>
  );
}

export { PANEL_HEIGHT, PANEL_WIDTH };
