import type { Panel } from "@comic-chat/comic-engine";
import { describe, expect, it } from "vitest";
import { computePanelBalloonLayout } from "./panelBalloonLayout";

const simplePose = { kind: "simple", bodyIndex: 0 } as const;

function panel(overrides: Partial<Panel> = {}): Panel {
  return {
    bodies: [
      { actorId: "alice", characterId: "mike", pose: simplePose, flip: false },
      { actorId: "bob", characterId: "tux", pose: simplePose, flip: true },
    ],
    balloons: [
      { speakerActorId: "alice", text: "hello there my friend, how are you doing today?", mode: "say" },
      { speakerActorId: "bob", text: "hi!!", mode: "say" },
    ],
    ...overrides,
  };
}

describe("computePanelBalloonLayout", () => {
  it("같은 내용의 패널을 다시 계산해도(참조가 달라도) 항상 같은 결과가 나온다 — Stage 4 재현성 증명", () => {
    // Room이 서버 재시작/재접속 시 이벤트 로그를 다시 fold하듯, 매번 새로운 Panel 객체를 만들되
    // 내용은 동일하게 구성한다 — 참조 동일성이 아니라 "내용이 같으면 결과도 같다"를 증명해야
    // "새로고침해도 동일하게 보인다"는 실제 요구를 검증한 것이 된다.
    const a = computePanelBalloonLayout(panel());
    const b = computePanelBalloonLayout(panel());
    expect(a).toEqual(b);
  });

  it("여러 번 반복해도(10회) 항상 동일한 결과다", () => {
    const results = Array.from({ length: 10 }, () => computePanelBalloonLayout(panel()));
    for (const r of results) expect(r).toEqual(results[0]);
  });

  it("내용이 다르면(텍스트가 다르면) 결과도 달라진다 — 시드가 실제로 내용에 반응한다", () => {
    const a = computePanelBalloonLayout(panel());
    const b = computePanelBalloonLayout(panel({ balloons: [{ speakerActorId: "alice", text: "completely different message here", mode: "say" }] }));
    expect(a).not.toEqual(b);
  });

  it("말풍선이 없는 패널도 예외 없이 처리된다", () => {
    const result = computePanelBalloonLayout(panel({ balloons: [] }));
    expect(result.placed).toEqual([]);
    expect(result.leftOver).toBeNull();
  });
});
