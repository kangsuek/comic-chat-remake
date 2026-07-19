import { describe, expect, it } from "vitest";
import { estimateTextWidth, estimateWidestWordWidth, estimateWrappedLineCount, splitTextToFit } from "./textMetrics.js";

describe("estimateWrappedLineCount", () => {
  it("빈 문자열은 1줄이다", () => {
    expect(estimateWrappedLineCount("", 200, 14)).toBe(1);
  });

  it("폭 안에 들어가는 짧은 텍스트는 1줄이다", () => {
    expect(estimateWrappedLineCount("hi", 200, 14)).toBe(1);
  });

  it("폭을 넘는 긴 영문 문장은 여러 줄로 추정된다", () => {
    const text = "this is a fairly long sentence that should wrap across several lines";
    expect(estimateWrappedLineCount(text, 100, 14)).toBeGreaterThan(1);
  });

  it("innerWidth가 0 이하이면 예외 없이 1을 돌려준다", () => {
    expect(estimateWrappedLineCount("hello", 0, 14)).toBe(1);
    expect(estimateWrappedLineCount("hello", -10, 14)).toBe(1);
  });

  it("같은 글자 수라도 한글(넓은 문자)이 영문보다 줄 수 추정이 같거나 더 많다", () => {
    const width = 120;
    const fontSize = 14;
    const latin = "abcdefghij"; // 10자
    const korean = "가나다라마바사아자차"; // 10자, 전부 넓은 문자
    expect(estimateWrappedLineCount(korean, width, fontSize)).toBeGreaterThanOrEqual(
      estimateWrappedLineCount(latin, width, fontSize),
    );
  });

  it("공백 없이 폭보다 훨씬 긴 한 덩어리 문자열도(예: 공백 없는 한자 나열) 내부에서 줄바꿈된다", () => {
    const longUnbrokenKorean = "가".repeat(50); // 공백 전혀 없음
    expect(estimateWrappedLineCount(longUnbrokenKorean, 100, 14)).toBeGreaterThan(3);
  });

  it("여러 단어로 이뤄진 문장은 공백 기준으로 줄바꿈된다(단어 중간에서 끊지 않음을 간접 확인)", () => {
    // 단어 하나하나는 폭 안에 들어가지만 합치면 넘치는 경우
    const text = "aaaa bbbb cccc dddd";
    const lines = estimateWrappedLineCount(text, 40, 14); // "aaaa"(4*7.7≈30.8)는 들어가지만 두 단어는 넘침
    expect(lines).toBeGreaterThanOrEqual(2);
  });
});

describe("estimateTextWidth", () => {
  it("빈 문자열은 폭이 0이다", () => {
    expect(estimateTextWidth("", 14)).toBe(0);
  });

  it("문자 수에 비례해 폭이 커진다", () => {
    expect(estimateTextWidth("aaaa", 14)).toBeGreaterThan(estimateTextWidth("aa", 14));
  });

  it("같은 글자 수라도 한글이 영문보다 넓다", () => {
    expect(estimateTextWidth("가나다", 14)).toBeGreaterThan(estimateTextWidth("abc", 14));
  });
});

describe("estimateWidestWordWidth", () => {
  it("빈 문자열은 0이다", () => {
    expect(estimateWidestWordWidth("", 14)).toBe(0);
  });

  it("여러 단어 중 가장 넓은 단어의 폭을 돌려준다", () => {
    const width = estimateWidestWordWidth("a bb ccccccccc dd", 14);
    expect(width).toBe(estimateTextWidth("ccccccccc", 14));
  });
});

describe("splitTextToFit", () => {
  it("maxLines 안에 들어가면 분할하지 않는다(leftOver=null)", () => {
    const result = splitTextToFit("hi there", 200, 3, 14);
    expect(result).toEqual({ fitted: "hi there", leftOver: null });
  });

  it("maxLines를 넘으면 단어 경계에서 잘라 fitted+leftOver로 나눈다", () => {
    const text = "aaaa bbbb cccc dddd eeee ffff";
    const result = splitTextToFit(text, 40, 1, 14); // 폭 40이면 "aaaa"(약 30.8) 한 단어 정도만 1줄에 들어감

    expect(result.leftOver).not.toBeNull();
    // 다시 합치면(단어 사이 공백 포함) 원문과 같아야 한다 — 내용 손실이 없어야 함
    expect(`${result.fitted} ${result.leftOver}`.replace(/\s+/g, " ").trim()).toBe(text);
  });

  it("fitted는 실제로 maxLines 안에 들어간다(재귀적으로 확인)", () => {
    const text = "one two three four five six seven eight nine ten";
    const result = splitTextToFit(text, 60, 2, 14);
    expect(result.leftOver).not.toBeNull();
    expect(estimateWrappedLineCount(result.fitted, 60, 14)).toBeLessThanOrEqual(2);
  });

  it("maxLines가 0 이하이면 전체가 leftOver로 넘어간다", () => {
    expect(splitTextToFit("hello", 100, 0, 14)).toEqual({ fitted: "", leftOver: "hello" });
  });

  it("빈 문자열은 분할 없이 그대로 fitted가 된다", () => {
    expect(splitTextToFit("", 100, 1, 14)).toEqual({ fitted: "", leftOver: null });
  });
});
