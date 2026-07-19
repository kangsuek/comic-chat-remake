import { describe, expect, it } from "vitest";
import {
  addTalkTos,
  doGreedyOrdering,
  evalPair,
  updateHysteresis,
  type PlacementPerson,
} from "./placement.js";

describe("evalPair", () => {
  it("talkTo가 없으면(세상을 향해 말함) 방향 불일치는 +4, 상대가 나를 안 보면 +2", () => {
    const a: PlacementPerson = { actorId: "a", talkTo: [] };
    const b: PlacementPerson = { actorId: "b", talkTo: [] };
    // b가 a보다 2칸 오른쪽(deltaPlacement=2) → desiredDir=false
    expect(evalPair(a, false, b, false, 2)).toBe(2); // 방향 일치, 상대는 desiredDir와 같아 안 봄 → +2
    expect(evalPair(a, true, b, true, 2)).toBe(4); // 방향 불일치 +4, 상대는 desiredDir와 달라 봄 → +0
  });

  it("talkTo 대상이면 방향 맞으면 거리비례 약한 페널티, 안 맞으면 중벌점", () => {
    const a: PlacementPerson = { actorId: "a", talkTo: ["b"] };
    const b: PlacementPerson = { actorId: "b", talkTo: [] };
    // b가 a보다 3칸 오른쪽 → desiredDir=false, distance=3
    expect(evalPair(a, false, b, false, 3)).toBe(4 * (3 - 1) + 4); // 방향 맞음(8) + 상대가 안 봄(4)
    expect(evalPair(a, true, b, false, 3)).toBe(44); // 방향 안 맞음(중벌점 40) + 상대도 desiredDir와 같아 안 봄(4)
  });

  it("talkTo 대상이 아니면 페널티 없음", () => {
    const a: PlacementPerson = { actorId: "a", talkTo: ["c"] };
    const b: PlacementPerson = { actorId: "b", talkTo: [] };
    expect(evalPair(a, false, b, false, 2)).toBe(0);
  });

  it("talkTo에 같은 대상이 중복으로 들어있으면 원작처럼 매칭될 때마다 페널티가 반복 적용된다", () => {
    // panel.cpp의 EvalPair는 av1->m_talkTo를 전부 순회하며 b2와 일치하는 항목마다 페널티를
    // 다시 더한다 — .includes() 같은 "존재 여부만 한 번 확인"이 아니다.
    const a: PlacementPerson = { actorId: "a", talkTo: ["b", "b"] };
    const b: PlacementPerson = { actorId: "b", talkTo: [] };
    const once: PlacementPerson = { actorId: "a", talkTo: ["b"] };

    expect(evalPair(a, false, b, false, 3)).toBe(2 * evalPair(once, false, b, false, 3));
  });
});

describe("addTalkTos", () => {
  it("talkTo 대상을 최대 5명까지 채운다", () => {
    const speakers: PlacementPerson[] = [{ actorId: "a", talkTo: ["b", "c", "d", "e", "f"] }];
    const result = addTalkTos(speakers, () => []);
    expect(result).toHaveLength(5); // a + b,c,d,e (f는 5명 한도로 잘림)
    expect(result.map((p) => p.actorId)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("중복은 추가하지 않는다", () => {
    const speakers: PlacementPerson[] = [
      { actorId: "a", talkTo: ["b"] },
      { actorId: "b", talkTo: ["a"] },
    ];
    const result = addTalkTos(speakers, () => []);
    expect(result.map((p) => p.actorId)).toEqual(["a", "b"]);
  });

  it("새로 추가된 사람의 talkTo는 resolveTalkTo로 채워지지만, 그 사람 자신의 talkTo로 추가 확장은 하지 않는다", () => {
    const speakers: PlacementPerson[] = [{ actorId: "a", talkTo: ["b"] }];
    const result = addTalkTos(speakers, (id) => (id === "b" ? ["c"] : []));
    expect(result.map((p) => p.actorId)).toEqual(["a", "b"]); // c는 추가되지 않음(b는 "초기 화자"가 아니므로)
    expect(result[1]).toEqual({ actorId: "b", talkTo: ["c"] });
  });
});

describe("doGreedyOrdering + updateHysteresis", () => {
  it("A가 B에게 말을 걸면 B가 A 옆에 배치되고 A를 바라보도록 flip이 결정된다", () => {
    const a: PlacementPerson = { actorId: "a", talkTo: ["b"] };
    const b: PlacementPerson = { actorId: "b", talkTo: [] };

    const placed = doGreedyOrdering([a, b], {});

    expect(placed).toHaveLength(2);
    expect(placed[0]).toEqual({ person: a, flip: false });
    expect(placed[1]).toEqual({ person: b, flip: true });

    const hysteresis = updateHysteresis(placed, {});
    expect(hysteresis["a"]).toEqual({ lastDir: false, lastRight: null, lastLeft: "b" });
    expect(hysteresis["b"]).toEqual({ lastDir: true, lastRight: "a", lastLeft: null });
  });

  it("동일 입력에 동일 히스테리시스를 주면 항상 같은 결과가 나온다(결정적)", () => {
    const a: PlacementPerson = { actorId: "a", talkTo: ["b"] };
    const b: PlacementPerson = { actorId: "b", talkTo: [] };
    const c: PlacementPerson = { actorId: "c", talkTo: [] };

    const run = () => doGreedyOrdering([a, b, c], {}).map((p) => ({ id: p.person.actorId, flip: p.flip }));
    expect(run()).toEqual(run());
  });

  it("빈 배열이면 아무것도 배치하지 않는다", () => {
    expect(doGreedyOrdering([], {})).toEqual([]);
  });
});
