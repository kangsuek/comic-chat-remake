import { estimateWrappedLineCount, type SpeechMode } from "@comic-chat/comic-engine";
import type Konva from "konva";
import { Circle, Group, Rect, Shape, Text } from "react-konva";

interface SpeechBubbleProps {
  x: number;
  y: number;
  width: number;
  height: number;
  /** 꼬리가 가리키는 지점의 로컬 x(이 말풍선의 left 기준 상대 좌표, 0~width 사이로 클램프됨). */
  tailX: number;
  text: string;
  fontSize?: number;
  mode?: SpeechMode;
}

const PADDING = 10;
const BUMP_SIZE = 8;
const TAIL_HEIGHT = 18;
const TAIL_BASE_WIDTH = 22;

/**
 * balloon.cpp의 CBWoodringNormal/Think/Whisper/Box를 모드별 시각 스타일로 포팅.
 * 스플라인 수식은 픽셀 동일 재현하지 않고(plan.md 방침) 오돌토돌한 "구름" 테두리로 근사한다.
 *
 * shout은 원작 MakeBalloon의 SM_SHOUT 분기가 `CBWoodringShout(...)`가 주석 처리된 채
 * `break`만 있어 실제로는 구현되어 있지 않다(호출됐다면 NULL 말풍선으로 이어져 크래시했을
 * 코드) — v1.0-pre에서 "외침"은 별도 말풍선이 아니라 AllCaps 규칙이 인식한 SHOUT 감정이
 * 캐릭터 표정으로만 드러나는 것이었다. 그래서 shout은 say와 시각적으로 동일하게 둔다.
 */
function drawCloudPath(ctx: Konva.Context, width: number, height: number, tailX: number, hasTail: boolean): void {
  const clampedTailX = Math.min(Math.max(tailX, TAIL_BASE_WIDTH), width - TAIL_BASE_WIDTH);
  const bumpsX = Math.max(3, Math.round(width / (BUMP_SIZE * 3)));
  const bumpsY = Math.max(2, Math.round(height / (BUMP_SIZE * 3)));
  const stepX = width / bumpsX;
  const stepY = height / bumpsY;

  ctx.beginPath();
  ctx.moveTo(0, 0);

  for (let i = 0; i < bumpsX; i++) {
    const cx = i * stepX + stepX / 2;
    ctx.quadraticCurveTo(cx, -BUMP_SIZE, (i + 1) * stepX, 0);
  }
  for (let i = 0; i < bumpsY; i++) {
    const cy = i * stepY + stepY / 2;
    ctx.quadraticCurveTo(width + BUMP_SIZE, cy, width, (i + 1) * stepY);
  }
  for (let i = bumpsX - 1; i >= 0; i--) {
    const cx = i * stepX + stepX / 2;
    const startX = (i + 1) * stepX;
    const endX = i * stepX;
    const inTailGap = hasTail && !(startX > clampedTailX + TAIL_BASE_WIDTH / 2 || endX < clampedTailX - TAIL_BASE_WIDTH / 2);
    if (!inTailGap) {
      ctx.quadraticCurveTo(cx, height + BUMP_SIZE, endX, height);
    } else {
      ctx.lineTo(endX, height);
    }
  }

  if (hasTail) {
    ctx.lineTo(clampedTailX + TAIL_BASE_WIDTH / 2, height);
    ctx.lineTo(clampedTailX, height + TAIL_HEIGHT);
    ctx.lineTo(clampedTailX - TAIL_BASE_WIDTH / 2, height);
  }

  for (let i = bumpsY - 1; i >= 0; i--) {
    const cy = i * stepY + stepY / 2;
    ctx.quadraticCurveTo(-BUMP_SIZE, cy, 0, i * stepY);
  }
  ctx.closePath();
}

interface ModeStyle {
  /** "arrow"=꼬리 삼각형(say/shout/whisper), "bubbles"=생각풍선 방울(think), "none"=없음(action). */
  tailKind: "arrow" | "bubbles" | "none";
  /** false면 구름 테두리 대신 각진 사각 박스(action — 원작 CBWoodringBox는 스플라인 자체가 없음). */
  cloud: boolean;
  dash?: number[];
  fontStyle?: string;
  align?: "center" | "left";
}

const MODE_STYLES: Record<SpeechMode, ModeStyle> = {
  say: { tailKind: "arrow", cloud: true },
  shout: { tailKind: "arrow", cloud: true }, // 위 설명대로 say와 동일
  think: { tailKind: "bubbles", cloud: true },
  whisper: { tailKind: "arrow", cloud: true, dash: [6, 4], fontStyle: "italic" },
  action: { tailKind: "none", cloud: false, fontStyle: "italic", align: "left" },
};

export function SpeechBubble({ x, y, width, height, tailX, text, fontSize = 14, mode = "say" }: SpeechBubbleProps) {
  const style = MODE_STYLES[mode];
  const clampedTailX = Math.min(Math.max(tailX, TAIL_BASE_WIDTH), width - TAIL_BASE_WIDTH);
  const innerWidth = Math.max(1, width - PADDING * 2);
  const lines = estimateWrappedLineCount(text, innerWidth, fontSize);
  const lineHeight = fontSize * 1.3;
  const textBlockHeight = lines * lineHeight;
  const textY = PADDING + Math.max(0, (height - PADDING * 2 - textBlockHeight) / 2);
  const hasArrowTail = style.tailKind === "arrow";

  return (
    <Group x={x} y={y}>
      {style.cloud ? (
        <Shape
          sceneFunc={(ctx, shape) => {
            drawCloudPath(ctx, width, height, clampedTailX, hasArrowTail);
            ctx.fillStrokeShape(shape);
          }}
          fill="white"
          stroke="black"
          strokeWidth={2}
          dash={style.dash}
        />
      ) : (
        <Rect width={width} height={height} fill="white" stroke="black" strokeWidth={2} dash={style.dash} />
      )}
      {style.tailKind === "bubbles" && (
        <>
          <Circle x={clampedTailX} y={height + 10} radius={6} fill="white" stroke="black" strokeWidth={2} />
          <Circle x={clampedTailX - 8} y={height + 22} radius={3.5} fill="white" stroke="black" strokeWidth={2} />
        </>
      )}
      <Text
        text={text}
        x={PADDING}
        y={textY}
        width={innerWidth}
        fontSize={fontSize}
        fontFamily="'Comic Sans MS', sans-serif"
        fontStyle={style.fontStyle}
        align={style.align ?? "center"}
        wrap="word"
      />
    </Group>
  );
}
