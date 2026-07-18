import { Group, Line, Rect, Text } from "react-konva";

interface SpeechBubbleProps {
  x: number;
  y: number;
  width: number;
  text: string;
}

const PADDING = 10;
const LINE_HEIGHT = 18;
const FONT_SIZE = 14;

/**
 * 단순 사각 말풍선 + 꼬리 하나. 원작의 랜덤 크기/route-region 충돌 회피는
 * Phase 3에서 랜덤 말풍선 알고리즘으로 고도화한다(docs/phases/03 참고).
 */
export function SpeechBubble({ x, y, width, text }: SpeechBubbleProps) {
  const innerWidth = width - PADDING * 2;
  const charsPerLine = Math.max(10, Math.floor(innerWidth / (FONT_SIZE * 0.55)));
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
  const height = lines * LINE_HEIGHT + PADDING * 2;
  const tailWidth = 20;
  const tailHeight = 16;

  return (
    <Group x={x} y={y}>
      <Rect width={width} height={height} fill="white" stroke="black" strokeWidth={2} cornerRadius={12} />
      <Text
        text={text}
        x={PADDING}
        y={PADDING}
        width={innerWidth}
        fontSize={FONT_SIZE}
        fontFamily="'Comic Sans MS', sans-serif"
        wrap="word"
      />
      <Line
        points={[width / 2 - tailWidth / 2, height - 1, width / 2, height + tailHeight, width / 2 + tailWidth / 2, height - 1]}
        closed
        fill="white"
        stroke="black"
        strokeWidth={2}
      />
    </Group>
  );
}
