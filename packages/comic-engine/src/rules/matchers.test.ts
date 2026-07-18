import { describe, expect, it } from "vitest";
import { checkAllCaps, checkStart, checkWord, findString, getSentenceStarts } from "./matchers.js";

describe("checkAllCaps", () => {
  it("대문자가 2개 초과면 true", () => {
    expect(checkAllCaps("HELLO")).toBe(true);
  });
  it("소문자가 하나라도 있으면 false", () => {
    expect(checkAllCaps("HEllo")).toBe(false);
  });
  it("대문자가 1개 이하면 false", () => {
    expect(checkAllCaps("A")).toBe(false);
    expect(checkAllCaps("!!!")).toBe(false);
  });
  it("문자와 무관한 기호가 섞여도 대문자만 센다", () => {
    expect(checkAllCaps("YOU ARE GREAT!!!")).toBe(true);
  });
});

describe("checkWord", () => {
  it("단어 경계에서 매칭되면 true", () => {
    expect(checkWord("I said LOL just now", "LOL")).toBe(true);
    expect(checkWord("LOL", "LOL")).toBe(true);
    expect(checkWord("well, LOL!", "LOL")).toBe(true);
  });
  it("다른 단어의 일부면 false", () => {
    expect(checkWord("LOLLY pop", "LOL")).toBe(false);
    expect(checkWord("hahaLOL", "LOL")).toBe(false);
  });
  it("대소문자를 구분한다", () => {
    expect(checkWord("i said lol", "LOL")).toBe(false);
  });
});

describe("findString", () => {
  it("단순 부분 문자열 검사", () => {
    expect(findString("i'm happy :)", ":)")).toBe(true);
    expect(findString("i'm sad :(", ":)")).toBe(false);
  });
});

describe("checkStart + getSentenceStarts", () => {
  it("문장이 substr로 시작하면 true, 뒤가 영숫자가 아니어야 함", () => {
    expect(checkStart("You are great", "You")).toBe(true);
    expect(checkStart("Youthful", "You")).toBe(false);
    expect(checkStart("You?", "You")).toBe(true);
  });

  it("getSentenceStarts는 첫 위치와 문장 종결부호 이후 위치를 반환", () => {
    const text = "Hi there. You are great!";
    const starts = getSentenceStarts(text);
    expect(starts).toEqual([0, 10]);
    expect(text.slice(10)).toBe("You are great!");
  });

  it("선행 공백은 건너뛴다", () => {
    const text = "   Hello world";
    expect(getSentenceStarts(text)).toEqual([3]);
  });
});
