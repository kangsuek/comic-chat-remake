import { estimateWrappedLineCount } from "@comic-chat/comic-engine";
import type Konva from "konva";
import { Group, Shape, Text } from "react-konva";

interface SpeechBubbleProps {
  x: number;
  y: number;
  width: number;
  height: number;
  /** 꼬리가 가리키는 지점의 로컬 x(이 말풍선의 left 기준 상대 좌표, 0~width 사이로 클램프됨). */
  tailX: number;
  text: string;
  fontSize?: number;
}

const PADDING = 10;
const BUMP_SIZE = 8;
const TAIL_HEIGHT = 18;
const TAIL_BASE_WIDTH = 22;

/**
 * balloon.cpp의 스플라인 기반 CBWoodringNormal 말풍선을 픽셀 동일 재현하지 않고(plan.md에
 * 이미 명시된 방침), 오돌토돌한 "구름" 테두리 + 꼬리를 가진 현대적 Canvas 경로로 재구현한다.
 * Konva.Shape의 sceneFunc로 직접 그려 원작의 "말풍선다움"을 흉내낸다.
 */
function drawCloudPath(ctx: Konva.Context, width: number, height: number, tailX: number): void {
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
    if (startX > clampedTailX + TAIL_BASE_WIDTH / 2 || endX < clampedTailX - TAIL_BASE_WIDTH / 2) {
      ctx.quadraticCurveTo(cx, height + BUMP_SIZE, endX, height);
    } else {
      ctx.lineTo(endX, height);
    }
  }

  ctx.lineTo(clampedTailX + TAIL_BASE_WIDTH / 2, height);
  ctx.lineTo(clampedTailX, height + TAIL_HEIGHT);
  ctx.lineTo(clampedTailX - TAIL_BASE_WIDTH / 2, height);

  for (let i = bumpsY - 1; i >= 0; i--) {
    const cy = i * stepY + stepY / 2;
    ctx.quadraticCurveTo(-BUMP_SIZE, cy, 0, i * stepY);
  }
  ctx.closePath();
}

/** 텍스트에 맞춰 줄 수를 추정해 높이를 정하는 로직은 호출자(estimateBalloonSize 계열)로 옮겼다. */
export function SpeechBubble({ x, y, width, height, tailX, text, fontSize = 14 }: SpeechBubbleProps) {
  const innerWidth = Math.max(1, width - PADDING * 2);
  const lines = estimateWrappedLineCount(text, innerWidth, fontSize);
  const lineHeight = fontSize * 1.3;
  const textBlockHeight = lines * lineHeight;
  const textY = PADDING + Math.max(0, (height - PADDING * 2 - textBlockHeight) / 2);

  return (
    <Group x={x} y={y}>
      <Shape
        sceneFunc={(ctx, shape) => {
          drawCloudPath(ctx, width, height, tailX);
          ctx.fillStrokeShape(shape);
        }}
        fill="white"
        stroke="black"
        strokeWidth={2}
      />
      <Text
        text={text}
        x={PADDING}
        y={textY}
        width={innerWidth}
        fontSize={fontSize}
        fontFamily="'Comic Sans MS', sans-serif"
        align="center"
        wrap="word"
      />
    </Group>
  );
}
