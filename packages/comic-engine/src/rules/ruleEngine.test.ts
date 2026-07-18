import { describe, expect, it } from "vitest";
import defaultRules from "./rules.default.json";
import { loadRules, resolveEmotion, type RuleDefinition } from "./ruleEngine.js";

const rules = loadRules(defaultRules as RuleDefinition[]);

function primaryOf(text: string) {
  return resolveEmotion(text, rules).primary;
}

// chat.rc STRINGTABLE(ID_RULE_*)에서 그대로 옮긴 (입력) → (기대 감정, 강도) 테이블.
describe("resolveEmotion — STRINGTABLE 규칙 재현", () => {
  it.each([
    ["ROTFL", "LAUGH", 11],
    ["LOL", "LAUGH", 11],
    ["that was so LOL", "LAUGH", 11],
    ["i'm happy :)", "HAPPY", 10],
    ["i'm happy :-)", "HAPPY", 10],
    ["i'm sad :(", "SAD", 10],
    ["i'm sad :-(", "SAD", 10],
    [";-)", "COY", 10],
    ["YOU ARE GREAT", "SHOUT", 9],
    ["this is amazing!!!", "SHOUT", 9],
    ["are you happy?", "POINTOTHER", 8],
    ["You are the best", "POINTOTHER", 4],
    ["i'm going home", "POINTSELF", 7],
    // "I will be there"는 CheckStart("I");3 뿐 아니라 CheckWord*("i will");7도 함께 매칭되어
    // (단어 규칙이 문장 규칙보다 먼저 처리되고 우선순위가 더 높으므로) 최종 priority는 7이 된다.
    ["I will be there", "POINTSELF", 7],
    ["I guess so", "POINTSELF", 3],
    ["Hi there", "WAVE", 2],
    ["Bye everyone", "WAVE", 3],
    ["Hello world", "WAVE", 5],
  ] as const)("%s → %s(%d)", (text, emotion, strength) => {
    const primary = primaryOf(text);
    expect(primary?.emotion).toBe(emotion);
    expect(primary?.priority).toBe(strength);
  });

  it("아무 규칙도 매칭되지 않으면 primary가 null", () => {
    const result = resolveEmotion("just a plain sentence", rules);
    expect(result.primary).toBeNull();
    expect(result.candidates).toEqual([]);
  });

  it("대소문자 무시 CheckWord*는 원문 대소문자와 무관하게 매칭한다", () => {
    // "happy"에 소문자가 있어 AllCaps(SHOUT)는 트리거되지 않고, CheckWord*("are you")만 매칭된다
    const primary = primaryOf("ARE YOU happy");
    expect(primary?.emotion).toBe("POINTOTHER");
    expect(primary?.priority).toBe(8);
  });
});

describe("resolveEmotion — 우선순위 override 동작", () => {
  it("같은 감정에 대해 더 높은 priority만 채택한다", () => {
    // AllCaps(SHOUT;9)와 FindString("!!!";9)가 동시에 매칭 — 동점이므로 먼저 등록된 값 유지
    const result = resolveEmotion("SO GREAT!!!", rules);
    const shoutCandidates = result.candidates.filter((c) => c.emotion === "SHOUT");
    expect(shoutCandidates).toHaveLength(1);
    expect(shoutCandidates[0]?.priority).toBe(9);
  });

  it("여러 감정이 동시에 매칭되면 후보로 모두 남고, primary는 최고 priority", () => {
    const result = resolveEmotion("Hi, are you LOL-ing at me?", rules);
    const emotions = result.candidates.map((c) => c.emotion).sort();
    expect(emotions).toEqual(["LAUGH", "POINTOTHER", "WAVE"].sort());
    expect(result.primary?.emotion).toBe("LAUGH");
    expect(result.primary?.priority).toBe(11);
  });
});

describe("resolveEmotion — 문장 단위 CheckStart", () => {
  it("두 번째 문장의 시작도 검사한다", () => {
    const result = resolveEmotion("Hi there. You are great!", rules);
    const emotions = result.candidates.map((c) => c.emotion).sort();
    expect(emotions).toEqual(["POINTOTHER", "WAVE"].sort());
  });
});
