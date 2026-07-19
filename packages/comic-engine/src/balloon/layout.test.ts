import { describe, expect, it } from "vitest";
import { estimateBalloonSize, layoutPanelBalloons, type BalloonRect, type RngLike } from "./layout.js";

function fixedRng(value: number): RngLike {
  return { next: () => value };
}

function sequenceRng(values: readonly number[]): RngLike {
  let i = 0;
  return { next: () => values[i++ % values.length]! };
}

const freeRect: BalloonRect = { left: 0, right: 2300, top: 0, bottom: -950 };

describe("estimateBalloonSize", () => {
  it("한 줄 임계값 이하 텍스트는 랜덤 없이 정확히 len+fudge(200) 폭이다", () => {
    // 원작은 goalWidth=len으로 시작해도 마지막에 항상 +200 fudge factor를 더한다
    // (min(goalWidth+200,maxWidth) 후 min(그것,len+200) — 둘 다 사실상 len+200으로 수렴).
    const size = estimateBalloonSize({
      text: "hi",
      mode: "say",
      arrowX: 500,
      freeRect,
      previousBottoms: [],
      fontSize: 14,
      rng: fixedRng(0.5),
    });
    const len = 2 * 14 * 0.55; // narrow char width ratio
    expect(size.width).toBeCloseTo(len + 200);
  });

  it("rng 값과 무관하게 짧은 텍스트의 폭은 동일하다(랜덤이 개입하지 않음)", () => {
    const a = estimateBalloonSize({ text: "short text", mode: "say", arrowX: 500, freeRect, previousBottoms: [], fontSize: 14, rng: fixedRng(0) });
    const b = estimateBalloonSize({ text: "short text", mode: "say", arrowX: 500, freeRect, previousBottoms: [], fontSize: 14, rng: fixedRng(0.999) });
    expect(a.width).toBe(b.width);
  });

  it("긴 텍스트는 rng 값에 따라 폭이 달라진다(minWidth~maxWidth 랜덤)", () => {
    const longText = "this is a very long message that will definitely need more than five hundred pixels of estimated width to render on a single line without wrapping at all";
    const low = estimateBalloonSize({ text: longText, mode: "say", arrowX: 1000, freeRect, previousBottoms: [], fontSize: 14, rng: fixedRng(0) });
    const high = estimateBalloonSize({ text: longText, mode: "say", arrowX: 1000, freeRect, previousBottoms: [], fontSize: 14, rng: fixedRng(0.999) });
    expect(high.width).toBeGreaterThan(low.width);
  });

  it("say 모드는 항상 arrowX를 말풍선 폭 안에 포함한다(왼쪽 클램프 제외 시)", () => {
    for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
      const size = estimateBalloonSize({ text: "hello there friend", mode: "say", arrowX: 1000, freeRect, previousBottoms: [], fontSize: 14, rng: fixedRng(r) });
      expect(size.left).toBeLessThanOrEqual(1000);
      expect(size.right).toBeGreaterThanOrEqual(1000);
    }
  });

  it("action 모드는 arrowX와 무관하게 freeRect 왼쪽에 붙는다", () => {
    const size = estimateBalloonSize({ text: "BOOM", mode: "action", arrowX: 2000, freeRect, previousBottoms: [], fontSize: 14, rng: fixedRng(0.5) });
    expect(size.left).toBe(freeRect.left);
  });

  it("freeRect 밖으로는 절대 나가지 않는다(클램프)", () => {
    const size = estimateBalloonSize({ text: "x".repeat(200), mode: "say", arrowX: 10, freeRect, previousBottoms: [], fontSize: 14, rng: fixedRng(0.999) });
    expect(size.left).toBeGreaterThanOrEqual(freeRect.left);
    expect(size.right).toBeLessThanOrEqual(freeRect.right);
  });

  it("이전 말풍선이 아래쪽에 있을수록(potentialHeight가 작을수록) minWidth가 커져 폭이 넓어지는 경향이 있다", () => {
    const longText = "this is a very long message that will definitely need more than five hundred pixels of estimated width to render on a single line without wrapping at all";
    const roomy = estimateBalloonSize({ text: longText, mode: "say", arrowX: 1000, freeRect, previousBottoms: [], fontSize: 14, rng: fixedRng(0) });
    const cramped = estimateBalloonSize({ text: longText, mode: "say", arrowX: 1000, freeRect, previousBottoms: [-900], fontSize: 14, rng: fixedRng(0) });
    // rng=0이면 goalWidth==minWidth이므로, potentialHeight가 작은(cramped) 쪽의 minWidth가 더 크거나 같다.
    expect(cramped.width).toBeGreaterThanOrEqual(roomy.width);
  });
});

describe("layoutPanelBalloons", () => {
  const balloonSpecs = (texts: string[]) => texts.map((text) => ({ text, mode: "say" as const, arrowX: 500 }));

  it("짧은 말풍선 하나는 그대로 다 들어간다", () => {
    const result = layoutPanelBalloons(balloonSpecs(["hi there"]), freeRect, 14, 18, fixedRng(0.5));
    expect(result.leftOver).toBeNull();
    expect(result.placed).toHaveLength(1);
    expect(result.placed[0]!.text).toBe("hi there");
  });

  it("여러 말풍선은 서로 겹치지 않게 아래로 쌓인다", () => {
    const result = layoutPanelBalloons(balloonSpecs(["first message", "second message", "third message"]), freeRect, 14, 18, fixedRng(0.3));
    expect(result.placed).toHaveLength(3);
    for (let i = 1; i < result.placed.length; i++) {
      // 다음 말풍선의 top은 이전 말풍선의 bottom 이하(같은 세로 구간을 공유하지 않음)
      expect(result.placed[i]!.top).toBeLessThanOrEqual(result.placed[i - 1]!.bottom);
    }
  });

  it("공간이 부족하면 마지막 말풍선을 강제로 잘라 leftOver를 돌려준다", () => {
    // 폭도 아주 좁고(줄마다 몇 글자 안 들어감) 세로 여유도 1줄 남짓뿐이라, 아주 긴 텍스트가
    // 도저히 다 들어갈 수 없다.
    const tinyRect: BalloonRect = { left: 0, right: 40, top: -900, bottom: -950 };
    const longText = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
    const result = layoutPanelBalloons(balloonSpecs([longText]), tinyRect, 14, 18, fixedRng(0.5));
    expect(result.leftOver).not.toBeNull();
    expect(result.placed).toHaveLength(1);
  });

  it("빈 배열이면 아무것도 배치하지 않고 leftOver도 없다", () => {
    expect(layoutPanelBalloons([], freeRect, 14, 18, fixedRng(0.5))).toEqual({ placed: [], leftOver: null });
  });

  it("결정적이다 — 같은 rng 시퀀스면 항상 같은 결과가 나온다", () => {
    const run = () => layoutPanelBalloons(balloonSpecs(["alpha beta", "gamma delta epsilon"]), freeRect, 14, 18, sequenceRng([0.1, 0.4, 0.7, 0.2]));
    expect(run()).toEqual(run());
  });
});
