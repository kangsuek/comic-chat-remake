import { describe, expect, it } from "vitest";
import { foldEvents, type ReactionEvent, type SayEvent } from "./fold.js";

const simplePose = { kind: "simple", bodyIndex: 0 } as const;

function say(actorId: string, text: string): SayEvent {
  return { type: "say", actorId, characterId: "mike", mode: "say", text, pose: simplePose };
}

function react(actorId: string, pose: SayEvent["pose"] = simplePose): ReactionEvent {
  return { type: "reaction", actorId, characterId: "mike", pose };
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

  describe("reaction 이벤트(AddReaction 포팅)", () => {
    // 첫 두 이벤트는 항상 새 패널이 열리는 "설정샷" 규칙 때문에(위 테스트들과 동일한 이유),
    // 실제로 검증하려는 시나리오는 항상 이 "몸풀기" 두 이벤트 다음부터 시작한다(기존 "말풍선
    // 5개 캡" 테스트와 동일한 패턴). warmup의 마지막 화자(y)는 클론 체인을 타고 이어지는
    // 패널에 계속 남아있으므로, 절대 개수 대신 "리액션 전/후 비교"로 검증한다.
    const warmup = [say("x", "warmup1"), say("y", "warmup2")];

    it("말풍선을 추가하지 않는다", () => {
      const before = foldEvents([...warmup, say("alice", "hi")]);
      const after = foldEvents([...warmup, say("alice", "hi"), react("alice")]);
      expect(after.panels.at(-1)!.balloons).toEqual(before.panels.at(-1)!.balloons);
    });

    it("이미 패널에 있는 화자의 리액션은 새 패널을 만들지 않고 그 자리에서 포즈만 바꾼다(AddLine과 반대)", () => {
      const complexPose = { kind: "complex", faceIndex: 1, torsoIndex: 0 } as const;
      const before = foldEvents([...warmup, say("alice", "1")]);
      const after = foldEvents([...warmup, say("alice", "1"), react("alice", complexPose)]);
      // say였다면 이미 패널에 있는 alice가 다시 등장 시 새 패널이 열렸겠지만, reaction은 그대로 클론된다.
      expect(after.panels).toHaveLength(before.panels.length);
      expect(after.panels.at(-1)!.bodies.map((b) => b.actorId).sort()).toEqual(
        before.panels.at(-1)!.bodies.map((b) => b.actorId).sort(),
      );
      expect(after.panels.at(-1)!.bodies.find((b) => b.actorId === "alice")!.pose).toEqual(complexPose);
    });

    it("패널에 없는 화자의 리액션은 새로 합류시킨다(말풍선 없이)", () => {
      const before = foldEvents([...warmup, say("alice", "1")]);
      const after = foldEvents([...warmup, say("alice", "1"), react("carol")]);
      expect(after.panels).toHaveLength(before.panels.length); // 새 패널이 아니라 클론
      expect(after.panels.at(-1)!.bodies.map((b) => b.actorId).sort()).toEqual(
        [...before.panels.at(-1)!.bodies.map((b) => b.actorId), "carol"].sort(),
      );
      expect(after.panels.at(-1)!.balloons).toEqual(before.panels.at(-1)!.balloons); // 말풍선은 그대로
    });

    it("리액션도 패널당 바디 5개 캡을 넘으면 새 패널을 만든다", () => {
      // warmup 뒤 y가 이미 있으므로 리액션 4명(a~d)만 더하면 정확히 5명(y+a+b+c+d)이 찬다.
      const events = [...warmup, react("a"), react("b"), react("c"), react("d")];
      const beforeCap = foldEvents(events);
      expect(beforeCap.panels.at(-1)!.bodies).toHaveLength(5);

      const afterCap = foldEvents([...events, react("e")]);
      expect(afterCap.panels).toHaveLength(beforeCap.panels.length + 1); // 5명이 찬 뒤 6번째는 새 패널로
    });
  });
});
