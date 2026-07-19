import type { AvatarManifest } from "@comic-chat/asset-manifest-types";
import type { HistoryEntry, ServerMessage } from "@comic-chat/protocol";
import { beforeEach, describe, expect, it } from "vitest";
import { EventStore } from "./eventStore.js";
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
    // 매 테스트마다 격리된 인메모리 DB를 써서 이전 테스트의 이벤트가 새지 않게 한다.
    room = new Room(testCatalog, new EventStore(":memory:"), "test-room");
  });

  it("join 시 joined→history(빈 배열)→memberList가 순서대로 브로드캐스트된다", () => {
    const alice = collector();
    const client = room.join("Alice", "mike-test", alice.send);

    expect(alice.messages).toHaveLength(3);
    expect(alice.messages[0]).toEqual({ type: "joined", actorId: client!.actorId });
    expect(alice.messages[1]).toEqual({ type: "history", entries: [] });
    expect(alice.messages[2]).toMatchObject({
      type: "memberList",
      members: [{ nick: "Alice", characterId: "mike-test" }],
    });
  });

  it("존재하지 않는 characterId는 입장을 거부한다(null 반환 + joinRejected 통지)", () => {
    const alice = collector();
    const client = room.join("Alice", "no-such-character", alice.send);
    expect(client).toBeNull();
    expect(alice.messages).toEqual([{ type: "joinRejected", reason: "invalidCharacter" }]);
  });

  it("이미 방에 있는 닉네임(대소문자 무관)으로는 입장을 거부한다", () => {
    room.join("Alice", "mike-test", () => {});
    const bob = collector();
    const client = room.join("aLICE", "tux-test", bob.send);
    expect(client).toBeNull();
    expect(bob.messages).toEqual([{ type: "joinRejected", reason: "nickTaken" }]);
  });

  it("이전 연결이 leave하지 않은 채로는 같은 닉으로 재접속할 수 없다(소켓 close→leave가 join보다 먼저 와야 함)", () => {
    const bob1 = collector();
    room.join("Bob", "tux-test", bob1.send);
    const bob2 = collector();
    const client = room.join("Bob", "tux-test", bob2.send);
    expect(client).toBeNull();
    expect(bob2.messages).toEqual([{ type: "joinRejected", reason: "nickTaken" }]);
  });

  it("changeNick으로 닉네임을 바꾸면 memberList가 갱신된다(historyEntry는 발생하지 않음)", () => {
    const alice = collector();
    const aliceClient = room.join("Alice", "mike-test", alice.send);
    const bob = collector();
    room.join("Bob", "tux-test", bob.send);

    alice.messages.length = 0;
    bob.messages.length = 0;
    room.changeNick(aliceClient!.actorId, "Alicia");

    expect(alice.messages).toHaveLength(1);
    expect(alice.messages[0]).toMatchObject({
      type: "memberList",
      members: [
        { nick: "Alicia", characterId: "mike-test" },
        { nick: "Bob", characterId: "tux-test" },
      ],
    });
    expect(bob.messages).toEqual(alice.messages); // 원작 ProcessNick과 동일하게 만화 패널엔 흔적이 없다
  });

  it("changeNick이 이미 쓰이는 닉네임이면 거부하고 memberList는 바뀌지 않는다", () => {
    const alice = collector();
    const aliceClient = room.join("Alice", "mike-test", alice.send);
    const bob = collector();
    room.join("Bob", "tux-test", bob.send);

    alice.messages.length = 0;
    room.changeNick(aliceClient!.actorId, "bob"); // 대소문자만 다름

    expect(alice.messages).toEqual([{ type: "changeNickRejected", reason: "nickTaken" }]);
  });

  it("changeNick의 새 닉네임이 공백뿐이면 거부한다", () => {
    const alice = collector();
    const aliceClient = room.join("Alice", "mike-test", alice.send);
    alice.messages.length = 0;

    room.changeNick(aliceClient!.actorId, "   ");

    expect(alice.messages).toEqual([{ type: "changeNickRejected", reason: "invalidNick" }]);
  });

  it("changeNick에 자기 자신과 같은 닉네임(트림 후 동일)을 주면 조용히 무시한다", () => {
    const alice = collector();
    const aliceClient = room.join("Alice", "mike-test", alice.send);
    alice.messages.length = 0;

    room.changeNick(aliceClient!.actorId, "Alice ");

    expect(alice.messages).toHaveLength(0);
  });

  it("존재하지 않는 actorId로 changeNick하면 아무 일도 일어나지 않는다", () => {
    expect(() => room.changeNick("no-such-actor", "Whoever")).not.toThrow();
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

  it("mode를 생략하면 say로 기록된다", () => {
    const alice = collector();
    const aliceClient = room.join("Alice", "mike-test", alice.send);
    room.say(aliceClient!.actorId, "hi");
    expect(alice.messages.at(-1)).toMatchObject({ type: "historyEntry", entry: { mode: "say" } });
  });

  it("clientId를 전달하면 historyEntry에 그대로 실려 되돌아온다(낙관적 업데이트 재조정용)", () => {
    const alice = collector();
    const aliceClient = room.join("Alice", "mike-test", alice.send);
    room.say(aliceClient!.actorId, "hi", "say", undefined, "client-generated-id-1");
    expect(alice.messages.at(-1)).toMatchObject({ type: "historyEntry", entry: { clientId: "client-generated-id-1" } });
  });

  it("clientId를 생략하면 historyEntry에도 필드가 없다", () => {
    const alice = collector();
    const aliceClient = room.join("Alice", "mike-test", alice.send);
    room.say(aliceClient!.actorId, "hi");
    const entry = alice.messages.at(-1);
    expect(entry?.type === "historyEntry" && "clientId" in entry.entry).toBe(false);
  });

  it("think/shout/action 모드로 발화하면 그 모드로 기록되고 전원에게 브로드캐스트된다", () => {
    const alice = collector();
    const aliceClient = room.join("Alice", "mike-test", alice.send);
    const bob = collector();
    room.join("Bob", "tux-test", bob.send);

    for (const mode of ["think", "shout", "action"] as const) {
      room.say(aliceClient!.actorId, `${mode} text`, mode);
      expect(alice.messages.at(-1)).toMatchObject({ type: "historyEntry", entry: { mode } });
      expect(bob.messages.at(-1)).toMatchObject({ type: "historyEntry", entry: { mode } });
    }
  });

  it("whisper는 발신자와 대상에게만 브로드캐스트되고, 제3자는 받지 못한다", () => {
    const alice = collector();
    const aliceClient = room.join("Alice", "mike-test", alice.send);
    const bob = collector();
    const bobClient = room.join("Bob", "tux-test", bob.send);
    const carol = collector();
    room.join("Carol", "mike-test", carol.send);

    alice.messages.length = 0;
    bob.messages.length = 0;
    carol.messages.length = 0;

    room.say(aliceClient!.actorId, "psst", "whisper", bobClient!.actorId);

    expect(alice.messages).toHaveLength(1);
    expect(alice.messages[0]).toMatchObject({ type: "historyEntry", entry: { mode: "whisper", text: "psst", targetActorId: bobClient!.actorId } });
    expect(bob.messages).toHaveLength(1);
    expect(bob.messages[0]).toEqual(alice.messages[0]);
    expect(carol.messages).toHaveLength(0); // 제3자는 받지 못함
  });

  it("whisper인데 targetActorId가 없으면 무시된다(null 반환)", () => {
    const aliceClient = room.join("Alice", "mike-test", () => {});
    expect(room.say(aliceClient!.actorId, "psst", "whisper")).toBeNull();
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

  it("whisper 이후 입장한 제3자는 history에서 그 whisper를 못 본다(같은 세션 내 대상 본인은 봄)", () => {
    const alice = collector();
    const aliceClient = room.join("Alice", "mike-test", alice.send);
    const bob = collector();
    const bobClient = room.join("Bob", "tux-test", bob.send);

    room.say(aliceClient!.actorId, "public hello", "say");
    room.say(aliceClient!.actorId, "secret", "whisper", bobClient!.actorId);

    const carol = collector();
    room.join("Carol", "mike-test", carol.send);
    const carolHistory = carol.messages.find((m) => m.type === "history");
    expect(carolHistory?.type === "history" && carolHistory.entries.map((e) => e.text)).toEqual(["public hello"]);

    // 알려진 한계: actorId는 접속(join)마다 새로 발급되는 randomUUID라 영속적 사용자 식별자가
    // 아니다(Phase 2/3에서 이미 확인된 설계) — Bob이 재접속하면 새 actorId를 받으므로 예전
    // targetActorId와 더 이상 일치하지 않아, 자기가 받았던 whisper라도 재접속 후에는 history에서
    // 사라진다. 영속 계정/식별자가 생기기 전까지는 감수해야 하는 트레이드오프다.
    // 실제 브라우저에서는 소켓이 끊기면 leave()가 먼저 호출된 뒤에야 재접속의 join()이 들어오므로,
    // 여기서도 그 순서를 그대로 시뮬레이션한다(Stage 2에서 닉네임 중복 검사가 생겨, leave 없이
    // 같은 닉으로 다시 join하면 이제는 nickTaken으로 거부된다 — 아래 별도 테스트로 확인).
    room.leave(bobClient!.actorId);
    const bobAgain = collector();
    room.join("Bob", "tux-test", bobAgain.send);
    const bobHistoryAfterReconnect = bobAgain.messages.find((m) => m.type === "history");
    expect(bobHistoryAfterReconnect?.type === "history" && bobHistoryAfterReconnect.entries.map((e) => e.text)).toEqual([
      "public hello",
    ]);
  });

  it("나중에 입장한 사람도 join 시 이전 대화 전체를 history로 받는다(재접속 replay)", () => {
    const alice = collector();
    const aliceClient = room.join("Alice", "mike-test", alice.send);
    room.say(aliceClient!.actorId, "first");
    room.say(aliceClient!.actorId, "second");

    const bob = collector();
    room.join("Bob", "tux-test", bob.send);

    const historyMsg = bob.messages.find((m) => m.type === "history");
    expect(historyMsg?.type).toBe("history");
    expect(historyMsg?.type === "history" && historyMsg.entries.map((e) => e.text)).toEqual(["first", "second"]);
  });

  it("서버 재시작(같은 EventStore로 Room을 다시 생성)해도 대화 로그가 그대로 복구된다", () => {
    const sharedStore = new EventStore(":memory:");
    const before = new Room(testCatalog, sharedStore, "restart-room");
    const aliceBefore = before.join("Alice", "mike-test", () => {});
    before.say(aliceBefore!.actorId, "SO GREAT!!!");

    const after = new Room(testCatalog, sharedStore, "restart-room");
    const bob = collector();
    after.join("Bob", "tux-test", bob.send);

    const historyMsg = bob.messages.find((m) => m.type === "history");
    expect(historyMsg?.type === "history" && historyMsg.entries).toMatchObject([
      { text: "SO GREAT!!!", emotion: { emotion: "SHOUT" } },
    ]);
    // fold도 이벤트 로그 전체를 replay해 동일한 패널 구조로 복구됐는지 확인
    expect(after.getPanels()).toHaveLength(1);
    expect(after.getPanels()[0]!.balloons).toHaveLength(1);
  });

  it("join만으로는 스냅샷이 생기지 않고, say() 후에는 마지막 seq로 저장된다", () => {
    const sharedStore = new EventStore(":memory:");
    const room = new Room(testCatalog, sharedStore, "snapshot-room");
    const alice = room.join("Alice", "mike-test", () => {})!;

    expect(sharedStore.loadSnapshot("snapshot-room")).toBeNull();

    room.say(alice.actorId, "hi");
    expect(sharedStore.loadSnapshot("snapshot-room")).toMatchObject({ seq: 1 });

    room.say(alice.actorId, "second"); // 같은 화자 연속 발화라 새 패널이 되지만 seq는 계속 증가
    expect(sharedStore.loadSnapshot("snapshot-room")).toMatchObject({ seq: 2 });
  });

  it("생성자가 스냅샷을 실제로 fold의 시작점으로 쓴다(스냅샷 이전 이벤트는 다시 fold하지 않음)", () => {
    const sharedStore = new EventStore(":memory:");
    const e1: HistoryEntry = {
      type: "say",
      mode: "say",
      actorId: "alice",
      nick: "Alice",
      text: "first",
      emotion: null,
      characterId: "mike-test",
      pose: { kind: "complex", faceIndex: 0, torsoIndex: 0 },
      ts: 100,
    };
    const e2: HistoryEntry = { ...e1, text: "second", ts: 200 };
    sharedStore.append("snap-room", e1);
    sharedStore.append("snap-room", e2);
    // 일부러 "e1이 없었던 것처럼" 빈 상태를 seq=1 스냅샷으로 저장한다.
    sharedStore.saveSnapshot("snap-room", 1, { panels: [], hysteresis: {} });

    const room = new Room(testCatalog, sharedStore, "snap-room");

    // 전체 로그를 처음부터 다시 fold했다면 두 패널(첫 발화가 설정샷 규칙으로 새 패널)이 나와야
    // 하지만, 스냅샷(seq=1, 빈 상태)을 기준으로 e2만 fold했으므로 e1은 패널 구조에 반영되지 않는다.
    expect(room.getPanels()).toHaveLength(1);
    expect(room.getPanels()[0]!.balloons).toEqual([{ speakerActorId: "alice", text: "second", mode: "say" }]);
  });
});
