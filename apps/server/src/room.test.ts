import type { AvatarManifest } from "@comic-chat/asset-manifest-types";
import type { ServerMessage } from "@comic-chat/protocol";
import { beforeEach, describe, expect, it } from "vitest";
import { Room } from "./room.js";

function collector() {
  const messages: ServerMessage[] = [];
  return { messages, send: (m: ServerMessage) => messages.push(m) };
}

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
      faces: [
        { poseIndex: 0, emotion: "NEUTRAL", intensity: 0, xCX: 0, yCX: 0, deltaXCX: 0, deltaYCX: 0, faceX: 0, faceY: 0 },
        { poseIndex: 1, emotion: "SHOUT", intensity: 1, xCX: 0, yCX: 0, deltaXCX: 0, deltaYCX: 0, faceX: 0, faceY: 0 },
      ],
      torsos: [{ poseIndex: 0, emotion: "NEUTRAL", intensity: 0, xCX: 0, yCX: 0 }],
    },
  ],
  [
    "tux-test",
    {
      characterId: "tux-test",
      name: "Tux",
      kind: "simple",
      flags: NO_FLAGS,
      icon: null,
      poses: [],
      bodies: [{ poseIndex: 0, emotion: "NEUTRAL", intensity: 0, faceX: 0, faceY: 0 }],
    },
  ],
]);

describe("Room", () => {
  let room: Room;

  beforeEach(() => {
    room = new Room(testCatalog);
  });

  it("join 시 memberList가 브로드캐스트된다", () => {
    const alice = collector();
    room.join("Alice", "mike-test", alice.send);

    expect(alice.messages).toHaveLength(1);
    expect(alice.messages[0]).toMatchObject({
      type: "memberList",
      members: [{ nick: "Alice", characterId: "mike-test" }],
    });
  });

  it("존재하지 않는 characterId는 입장을 거부한다(null 반환)", () => {
    const alice = collector();
    const client = room.join("Alice", "no-such-character", alice.send);
    expect(client).toBeNull();
    expect(alice.messages).toHaveLength(0);
  });

  it("두 번째 입장 시 기존 멤버도 갱신된 memberList를 받는다", () => {
    const alice = collector();
    room.join("Alice", "mike-test", alice.send);
    const bob = collector();
    room.join("Bob", "tux-test", bob.send);

    const lastAliceMsg = alice.messages.at(-1);
    expect(lastAliceMsg).toMatchObject({
      type: "memberList",
      members: [
        { nick: "Alice", characterId: "mike-test" },
        { nick: "Bob", characterId: "tux-test" },
      ],
    });
  });

  it("say 시 감정 라벨 + 포즈 정보가 포함된 historyEntry가 전원에게 브로드캐스트된다", () => {
    const alice = collector();
    const aliceClient = room.join("Alice", "mike-test", alice.send);
    const bob = collector();
    room.join("Bob", "tux-test", bob.send);

    room.say(aliceClient!.actorId, "SO GREAT!!!");

    const aliceEntry = alice.messages.at(-1);
    const bobEntry = bob.messages.at(-1);
    expect(aliceEntry).toEqual(bobEntry);
    expect(aliceEntry).toMatchObject({
      type: "historyEntry",
      entry: {
        type: "say",
        nick: "Alice",
        text: "SO GREAT!!!",
        emotion: { emotion: "SHOUT", priority: 9 },
        characterId: "mike-test",
        pose: { kind: "complex", faceIndex: 1, torsoIndex: 0 },
      },
    });
  });

  it("simple 아바타는 pose.kind가 simple이다", () => {
    const bob = collector();
    const bobClient = room.join("Bob", "tux-test", bob.send);

    room.say(bobClient!.actorId, "hi");

    const entry = bob.messages.at(-1);
    expect(entry).toMatchObject({ type: "historyEntry", entry: { pose: { kind: "simple", bodyIndex: 0 } } });
  });

  it("규칙에 매칭되지 않으면 emotion이 null이다", () => {
    const alice = collector();
    const aliceClient = room.join("Alice", "mike-test", alice.send);

    room.say(aliceClient!.actorId, "just a plain sentence");

    const entry = alice.messages.at(-1);
    expect(entry).toMatchObject({ type: "historyEntry", entry: { emotion: null } });
  });

  it("존재하지 않는 actorId로 say하면 무시된다", () => {
    const result = room.say("no-such-actor", "hello");
    expect(result).toBeNull();
  });

  it("leave 시 memberList가 갱신된다", () => {
    const alice = collector();
    const aliceClient = room.join("Alice", "mike-test", alice.send);
    const bob = collector();
    room.join("Bob", "tux-test", bob.send);

    room.leave(aliceClient!.actorId);

    const lastBobMsg = bob.messages.at(-1);
    expect(lastBobMsg).toMatchObject({
      type: "memberList",
      members: [{ nick: "Bob", characterId: "tux-test" }],
    });
  });
});
