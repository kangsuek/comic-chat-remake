import { describe, expect, it } from "vitest";
import { foldEvents, type SayEvent } from "./fold.js";

const simplePose = { kind: "simple", bodyIndex: 0 } as const;

function say(actorId: string, text: string): SayEvent {
  return { actorId, characterId: "mike", mode: "say", text, pose: simplePose };
}

describe("foldEvents", () => {
  it("이벤트가 없으면 빈 결과를 돌려준다", () => {
    expect(foldEvents([])).toEqual({ panels: [], hysteresis: {} });
  });

  it("첫 두 이벤트는 항상 새 패널을 만든다(설정샷 규칙)", () => {
    const result = foldEvents([say("alice", "hi"), say("alice", "again")]);
    expect(result.panels).toHaveLength(2);
    expect(result.panels[0]!.balloons).toEqual([{ speakerActorId: "alice", text: "hi", mode: "say" }]);
    expect(result.panels[1]!.balloons).toEqual([{ speakerActorId: "alice", text: "again", mode: "say" }]);
  });

  it("패널이 2개 이상 확정된 뒤 새 화자가 합류하면 클론(패널 수는 늘지 않는다)", () => {
    const result = foldEvents([say("alice", "1"), say("alice", "2"), say("bob", "3")]);

    expect(result.panels).toHaveLength(2); // 클론이 이전 패널을 대체했으므로 여전히 2개
    const lastPanel = result.panels[1]!;
    // 그리디 배치 결과: alice가 기존 위치(hysteresis lastDir=false) 유지, bob은 alice 오른쪽에서
    // alice를 바라보도록(flip=true) 배치된다(evalPlacement 손계산으로 검증, rating: j=1,flip=true가 2로 최소).
    expect(lastPanel.bodies.map((b) => ({ actorId: b.actorId, flip: b.flip }))).toEqual([
      { actorId: "alice", flip: false },
      { actorId: "bob", flip: true },
    ]);
    expect(lastPanel.balloons.map((b) => b.text)).toEqual(["2", "3"]); // 클론이 기존 말풍선을 보존
  });

  it("이미 패널에 있는 화자가 다시 말하면(연속 발화) 새 패널을 만든다", () => {
    const result = foldEvents([say("alice", "1"), say("alice", "2"), say("bob", "3"), say("bob", "4")]);
    expect(result.panels).toHaveLength(3); // bob이 자기 패널에서 또 말해서 새 패널
    expect(result.panels[2]!.balloons).toEqual([{ speakerActorId: "bob", text: "4", mode: "say" }]);
  });

  it("한 패널에 말풍선이 5개 쌓이면 새 패널을 만든다", () => {
    const events = [say("alice", "1"), say("alice", "2")];
    // 3번째부터는 서로 다른 화자로 클론을 유도해 같은 패널에 말풍선을 계속 쌓는다
    for (const actor of ["bob", "carol", "dave", "erin"]) events.push(say(actor, actor));

    const result = foldEvents(events);
    const last = result.panels.at(-1)!;
    // 말풍선이 5개가 되는 순간 새 패널이 열리므로 마지막 패널의 말풍선은 5개를 넘지 않는다
    expect(last.balloons.length).toBeLessThanOrEqual(5);
  });

  it("action 모드는 항상 새 패널을 만든다", () => {
    const result = foldEvents([say("alice", "1"), { ...say("alice", "boom"), mode: "action" }]);
    expect(result.panels).toHaveLength(2);
    expect(result.panels[1]!.balloons[0]!.mode).toBe("action");
  });

  it("panel.bodies 배열 순서는 삽입 순서가 아니라 그리디 배치가 결정한 좌우 순서를 따른다", () => {
    // a,b,c,d가 순서대로(삽입 순서 a,b,c,d) 한 패널에 클론으로 합류하지만, 그리디 배치는
    // 히스테리시스에 따라 다른 좌우 순서를 고를 수 있다 — 배열도 그 순서를 반영해야 렌더러가
    // 배열 순서를 곧 화면 배치 순서로 쓸 수 있다(placement.ts는 이미 Stage 1에서 별도 검증됨).
    const result = foldEvents([say("a", "1"), say("a", "2"), say("b", "3"), say("c", "4"), say("d", "5")]);
    const lastPanel = result.panels.at(-1)!;

    expect(lastPanel.bodies.map((b) => b.actorId)).not.toEqual(["a", "b", "c", "d"]); // 삽입 순서와 다름을 확인
    expect(lastPanel.bodies.map((b) => b.actorId)).toEqual(["d", "c", "a", "b"]); // doGreedyOrdering이 실제로 계산한 순서
  });

  it("previous를 넘겨 이어서 fold하면 한 번에 fold한 것과 동일한 결과가 나온다(증분 fold)", () => {
    const events = [say("alice", "1"), say("alice", "2"), say("bob", "3"), say("carol", "4")];

    const whole = foldEvents(events);

    let incremental = foldEvents([]);
    for (const event of events) {
      incremental = foldEvents([event], incremental);
    }

    expect(incremental).toEqual(whole);
  });
});
