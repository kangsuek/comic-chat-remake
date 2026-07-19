import type { HistoryEntry } from "@comic-chat/protocol";
import { beforeEach, describe, expect, it } from "vitest";
import { EventStore } from "./eventStore.js";

function entry(actorId: string, text: string, ts: number): HistoryEntry {
  return {
    type: "say",
    actorId,
    nick: actorId,
    text,
    emotion: null,
    characterId: "mike",
    pose: { kind: "simple", bodyIndex: 0 },
    ts,
  };
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
    expect(loaded.map((e) => e.text)).toEqual(["1", "2", "3"]);
  });

  it("room_id가 다르면 서로 섞이지 않는다", () => {
    store.append("lobby", entry("alice", "lobby-msg", 100));
    store.append("other-room", entry("bob", "other-msg", 100));

    expect(store.loadAll("lobby").map((e) => e.text)).toEqual(["lobby-msg"]);
    expect(store.loadAll("other-room").map((e) => e.text)).toEqual(["other-msg"]);
  });

  it("이벤트가 없는 room은 빈 배열을 돌려준다", () => {
    expect(store.loadAll("empty-room")).toEqual([]);
  });
});
