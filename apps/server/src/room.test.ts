import type { ServerMessage } from "@comic-chat/protocol";
import { beforeEach, describe, expect, it } from "vitest";
import { Room } from "./room.js";

function collector() {
  const messages: ServerMessage[] = [];
  return { messages, send: (m: ServerMessage) => messages.push(m) };
}

describe("Room", () => {
  let room: Room;

  beforeEach(() => {
    room = new Room();
  });

  it("join 시 memberList가 브로드캐스트된다", () => {
    const alice = collector();
    room.join("Alice", alice.send);

    expect(alice.messages).toHaveLength(1);
    expect(alice.messages[0]).toMatchObject({
      type: "memberList",
      members: [{ nick: "Alice" }],
    });
  });

  it("두 번째 입장 시 기존 멤버도 갱신된 memberList를 받는다", () => {
    const alice = collector();
    room.join("Alice", alice.send);
    const bob = collector();
    room.join("Bob", bob.send);

    const lastAliceMsg = alice.messages.at(-1);
    expect(lastAliceMsg).toMatchObject({
      type: "memberList",
      members: [{ nick: "Alice" }, { nick: "Bob" }],
    });
  });

  it("say 시 감정 라벨이 포함된 historyEntry가 전원에게 브로드캐스트된다", () => {
    const alice = collector();
    const aliceClient = room.join("Alice", alice.send);
    const bob = collector();
    room.join("Bob", bob.send);

    room.say(aliceClient.actorId, "SO GREAT!!!");

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
      },
    });
  });

  it("규칙에 매칭되지 않으면 emotion이 null이다", () => {
    const alice = collector();
    const aliceClient = room.join("Alice", alice.send);

    room.say(aliceClient.actorId, "just a plain sentence");

    const entry = alice.messages.at(-1);
    expect(entry).toMatchObject({ type: "historyEntry", entry: { emotion: null } });
  });

  it("존재하지 않는 actorId로 say하면 무시된다", () => {
    const result = room.say("no-such-actor", "hello");
    expect(result).toBeNull();
  });

  it("leave 시 memberList가 갱신된다", () => {
    const alice = collector();
    const aliceClient = room.join("Alice", alice.send);
    const bob = collector();
    room.join("Bob", bob.send);

    room.leave(aliceClient.actorId);

    const lastBobMsg = bob.messages.at(-1);
    expect(lastBobMsg).toMatchObject({
      type: "memberList",
      members: [{ nick: "Bob" }],
    });
  });
});
