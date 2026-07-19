import type { AvatarManifest } from "@comic-chat/asset-manifest-types";
import { beforeEach, describe, expect, it } from "vitest";
import { EventStore } from "./eventStore.js";
import { RoomRegistry } from "./roomRegistry.js";

const NO_FLAGS = { headMask: false, torsoMask: false, torsoFirst: false };

const testCatalog = new Map<string, AvatarManifest>([
  [
    "mike-test",
    {
      characterId: "mike-test",
      name: "Mike",
      kind: "complex",
      flags: NO_FLAGS,
      icon: null,
      poses: [],
      faces: [{ poseIndex: 0, emotion: "NEUTRAL", intensity: 0, xCX: 0, yCX: 0, deltaXCX: 0, deltaYCX: 0, faceX: 0, faceY: 0 }],
      torsos: [{ poseIndex: 0, emotion: "NEUTRAL", intensity: 0, xCX: 0, yCX: 0 }],
    },
  ],
]);

describe("RoomRegistry", () => {
  let registry: RoomRegistry;

  beforeEach(() => {
    registry = new RoomRegistry(testCatalog, new EventStore(":memory:"));
  });

  it("같은 roomId로 getOrCreate를 두 번 호출하면 같은 Room 인스턴스를 돌려준다", () => {
    const a = registry.getOrCreate("room-a");
    const b = registry.getOrCreate("room-a");
    expect(a).toBe(b);
  });

  it("다른 roomId는 서로 다른 Room을 지연 생성한다", () => {
    const a = registry.getOrCreate("room-a");
    const b = registry.getOrCreate("room-b");
    expect(a).not.toBe(b);
  });

  it("get()은 아직 생성되지 않은 room에 대해 undefined를 돌려준다(생성하지 않음)", () => {
    expect(registry.get("no-such-room")).toBeUndefined();
    expect(registry.list()).toEqual([]);
  });

  it("list()는 현재 메모리에 있는 room과 멤버 수를 돌려준다", () => {
    const roomA = registry.getOrCreate("room-a");
    roomA.join("Alice", "mike-test", () => {});
    roomA.join("Bob", "mike-test", () => {});
    registry.getOrCreate("room-b"); // 아무도 안 들어간 빈 방

    expect(registry.list().sort((x, y) => x.roomId.localeCompare(y.roomId))).toEqual([
      { roomId: "room-a", memberCount: 2 },
      { roomId: "room-b", memberCount: 0 },
    ]);
  });

  it("leaveAndCleanup은 마지막 멤버가 나가면 room을 메모리에서 제거한다", () => {
    const room = registry.getOrCreate("room-a");
    const alice = room.join("Alice", "mike-test", () => {})!;

    registry.leaveAndCleanup("room-a", alice.actorId);

    expect(registry.get("room-a")).toBeUndefined();
    expect(registry.list()).toEqual([]);
  });

  it("leaveAndCleanup 후에도 같은 roomId로 다시 들어오면 이전 대화 로그가 복구된다", () => {
    const room = registry.getOrCreate("room-a");
    const alice = room.join("Alice", "mike-test", () => {})!;
    room.say(alice.actorId, "hello before cleanup");
    registry.leaveAndCleanup("room-a", alice.actorId);

    expect(registry.get("room-a")).toBeUndefined(); // 메모리에서는 사라짐

    const messages: unknown[] = [];
    registry.getOrCreate("room-a").join("Bob", "mike-test", (m) => messages.push(m));

    const historyMsg = messages.find((m): m is { type: "history"; entries: { text: string }[] } => (m as { type: string }).type === "history");
    expect(historyMsg?.entries.map((e) => e.text)).toEqual(["hello before cleanup"]);
  });

  it("leaveAndCleanup은 멤버가 남아있으면 room을 메모리에 유지한다", () => {
    const room = registry.getOrCreate("room-a");
    const alice = room.join("Alice", "mike-test", () => {})!;
    room.join("Bob", "mike-test", () => {});

    registry.leaveAndCleanup("room-a", alice.actorId);

    expect(registry.get("room-a")).toBe(room);
    expect(registry.list()).toEqual([{ roomId: "room-a", memberCount: 1 }]);
  });

  it("존재하지 않는 room에 leaveAndCleanup을 호출해도 아무 일도 일어나지 않는다", () => {
    expect(() => registry.leaveAndCleanup("no-such-room", "no-such-actor")).not.toThrow();
  });
});
