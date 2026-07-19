import { describe, expect, it } from "vitest";
import { fetchSpeaker, shouldStartNewPanel } from "./panel.js";
import { clonePanel, type Panel } from "./types.js";

const simplePose = { kind: "simple", bodyIndex: 0 } as const;

function panelWith(bodyActorIds: string[], balloonCount: number): Panel {
  return {
    bodies: bodyActorIds.map((actorId) => ({ actorId, characterId: "mike", pose: simplePose, flip: false })),
    balloons: Array.from({ length: balloonCount }, (_, i) => ({
      speakerActorId: bodyActorIds[i % bodyActorIds.length] ?? "alice",
      text: `msg${i}`,
      mode: "say" as const,
    })),
  };
}

describe("shouldStartNewPanel", () => {
  it("action 모드는 항상 새 패널", () => {
    const panel = panelWith(["bob"], 1);
    expect(shouldStartNewPanel({ currentPanel: panel, speakerActorId: "alice", mode: "action", totalPanelCount: 5 })).toBe(true);
  });

  it("현재 패널이 없으면 새 패널", () => {
    expect(shouldStartNewPanel({ currentPanel: null, speakerActorId: "alice", mode: "say", totalPanelCount: 5 })).toBe(true);
  });

  it("전체 패널 수가 2 미만이면 항상 새 패널(초반 설정샷)", () => {
    const panel = panelWith(["bob"], 1);
    expect(shouldStartNewPanel({ currentPanel: panel, speakerActorId: "alice", mode: "say", totalPanelCount: 0 })).toBe(true);
    expect(shouldStartNewPanel({ currentPanel: panel, speakerActorId: "alice", mode: "say", totalPanelCount: 1 })).toBe(true);
  });

  it("말풍선이 5개 이상이면 새 패널", () => {
    const panel = panelWith(["bob"], 5);
    expect(shouldStartNewPanel({ currentPanel: panel, speakerActorId: "alice", mode: "say", totalPanelCount: 5 })).toBe(true);
  });

  it("화자가 이미 패널에 있으면(연속 발화) 새 패널", () => {
    const panel = panelWith(["alice", "bob"], 2);
    expect(shouldStartNewPanel({ currentPanel: panel, speakerActorId: "alice", mode: "say", totalPanelCount: 5 })).toBe(true);
  });

  it("새 화자가 합류하면 클론(새 패널 아님)", () => {
    const panel = panelWith(["bob"], 1);
    expect(shouldStartNewPanel({ currentPanel: panel, speakerActorId: "alice", mode: "say", totalPanelCount: 5 })).toBe(false);
  });
});

describe("fetchSpeaker", () => {
  it("이미 있으면 기존 body를 그대로 반환한다", () => {
    const panel = panelWith(["alice"], 1);
    const before = panel.bodies[0];
    const result = fetchSpeaker(panel, "alice", "mike", simplePose);
    expect(result).toBe(before);
    expect(panel.bodies).toHaveLength(1);
  });

  it("없으면 새로 추가한다", () => {
    const panel = panelWith(["bob"], 1);
    const result = fetchSpeaker(panel, "alice", "susan", simplePose);
    expect(panel.bodies).toHaveLength(2);
    expect(result).toEqual({ actorId: "alice", characterId: "susan", pose: simplePose, flip: false });
  });
});

describe("clonePanel", () => {
  it("깊은 복사본을 만든다 — 원본을 바꿔도 클론은 영향받지 않는다", () => {
    const original = panelWith(["alice"], 1);
    const clone = clonePanel(original);

    clone.bodies.push({ actorId: "bob", characterId: "tux", pose: simplePose, flip: false });
    clone.balloons[0]!.text = "changed";

    expect(original.bodies).toHaveLength(1);
    expect(original.balloons[0]!.text).toBe("msg0");
    expect(clone.bodies).toHaveLength(2);
  });
});
