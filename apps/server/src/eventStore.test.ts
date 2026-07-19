import type { HistoryEntry } from "@comic-chat/protocol";
import { beforeEach, describe, expect, it } from "vitest";
import { EventStore } from "./eventStore.js";

function entry(actorId: string, text: string, ts: number, overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    type: "say",
    mode: "say",
    actorId,
    nick: actorId,
    text,
    emotion: null,
    characterId: "mike",
    pose: { kind: "simple", bodyIndex: 0 },
    ts,
    ...overrides,
  } as HistoryEntry;
}

/** 이 파일의 모든 fixture는 항상 say 타입이라(entry() 참고) 텍스트를 안전하게 꺼낼 수 있다. */
function textOf(e: HistoryEntry): string {
  if (e.type !== "say") throw new Error("expected a say entry");
  return e.text;
}

describe("EventStore", () => {
  let store: EventStore;

  beforeEach(() => {
    store = new EventStore(":memory:");
  });

  it("append한 이벤트를 seq 순서대로 loadAll로 돌려받는다", () => {
    store.append("lobby", entry("alice", "1", 100));
    store.append("lobby", entry("bob", "2", 200));
    store.append("lobby", entry("alice", "3", 300));

    const loaded = store.loadAll("lobby");
    expect(loaded.map(textOf)).toEqual(["1", "2", "3"]);
  });

  it("room_id가 다르면 서로 섞이지 않는다", () => {
    store.append("lobby", entry("alice", "lobby-msg", 100));
    store.append("other-room", entry("bob", "other-msg", 100));

    expect(store.loadAll("lobby").map(textOf)).toEqual(["lobby-msg"]);
    expect(store.loadAll("other-room").map(textOf)).toEqual(["other-msg"]);
  });

  it("이벤트가 없는 room은 빈 배열을 돌려준다", () => {
    expect(store.loadAll("empty-room")).toEqual([]);
  });

  it("append는 room 안에서 1부터 증가하는 seq를 돌려준다", () => {
    expect(store.append("lobby", entry("alice", "1", 100))).toBe(1);
    expect(store.append("lobby", entry("bob", "2", 200))).toBe(2);
    expect(store.append("other-room", entry("carol", "3", 300))).toBe(1); // room마다 독립적
  });

  it("loadSince는 주어진 seq보다 큰 이벤트만(경계값 제외) 돌려준다", () => {
    store.append("lobby", entry("alice", "1", 100));
    store.append("lobby", entry("bob", "2", 200));
    store.append("lobby", entry("alice", "3", 300));

    expect(store.loadSince("lobby", 0).map((e) => ({ seq: e.seq, text: textOf(e.entry) }))).toEqual([
      { seq: 1, text: "1" },
      { seq: 2, text: "2" },
      { seq: 3, text: "3" },
    ]);
    expect(store.loadSince("lobby", 1).map((e) => textOf(e.entry))).toEqual(["2", "3"]);
    expect(store.loadSince("lobby", 3)).toEqual([]); // 마지막 seq와 같으면 아무것도 없음
  });

  it("스냅샷이 없으면 loadSnapshot이 null을 돌려준다", () => {
    expect(store.loadSnapshot("lobby")).toBeNull();
  });

  it("saveSnapshot/loadSnapshot이 왕복하고, 같은 room에 다시 저장하면 덮어쓴다", () => {
    const stateA = { panels: [{ bodies: [], balloons: [] }], hysteresis: {} };
    store.saveSnapshot("lobby", 2, stateA);
    expect(store.loadSnapshot("lobby")).toEqual({ seq: 2, state: stateA });

    const stateB = { panels: [], hysteresis: { alice: { lastDir: true, lastRight: null, lastLeft: null } } };
    store.saveSnapshot("lobby", 5, stateB);
    expect(store.loadSnapshot("lobby")).toEqual({ seq: 5, state: stateB });
  });

  describe("loadVisibleTo", () => {
    it("whisper가 아닌 이벤트는 모두에게 보인다", () => {
      store.append("lobby", entry("alice", "hi everyone", 100));
      expect(store.loadVisibleTo("lobby", "carol").map(textOf)).toEqual(["hi everyone"]);
    });

    it("whisper는 발신자와 targetActorId 본인에게만 보인다", () => {
      store.append("lobby", entry("alice", "psst", 100, { mode: "whisper", targetActorId: "bob" }));

      expect(store.loadVisibleTo("lobby", "alice").map(textOf)).toEqual(["psst"]); // 발신자
      expect(store.loadVisibleTo("lobby", "bob").map(textOf)).toEqual(["psst"]); // 수신자
      expect(store.loadVisibleTo("lobby", "carol").map(textOf)).toEqual([]); // 제3자에게는 안 보임
    });

    it("일반 발화와 whisper가 섞여 있으면 whisper만 골라 걸러낸다", () => {
      store.append("lobby", entry("alice", "public 1", 100));
      store.append("lobby", entry("alice", "secret", 200, { mode: "whisper", targetActorId: "bob" }));
      store.append("lobby", entry("bob", "public 2", 300));

      expect(store.loadVisibleTo("lobby", "carol").map(textOf)).toEqual(["public 1", "public 2"]);
      expect(store.loadVisibleTo("lobby", "bob").map(textOf)).toEqual(["public 1", "secret", "public 2"]);
    });
  });
});
