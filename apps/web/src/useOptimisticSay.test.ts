import { createInitialPoseState } from "@comic-chat/comic-engine";
import type { AvatarManifest } from "@comic-chat/asset-manifest-types";
import type { HistoryEntry } from "@comic-chat/protocol";
import { describe, expect, it } from "vitest";
import { buildProvisionalEntry, reconcilePending } from "./useOptimisticSay";

const NO_FLAGS = { headMask: false, torsoMask: false, torsoFirst: false };

const mikeAvatar: AvatarManifest = {
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
};

const tuxAvatar: AvatarManifest = {
  characterId: "tux-test",
  name: "Tux",
  kind: "simple",
  flags: NO_FLAGS,
  icon: null,
  poses: [],
  bodies: [{ poseIndex: 0, emotion: "NEUTRAL", intensity: 0, faceX: 0, faceY: 0 }],
};

describe("buildProvisionalEntry", () => {
  it("Room.say()와 동일한 방식으로 감정/포즈를 계산해 잠정 historyEntry를 만든다", () => {
    const poseState = createInitialPoseState();
    const entry = buildProvisionalEntry({
      text: "SO GREAT!!!",
      mode: "say",
      selfActorId: "actor-1",
      nick: "Alice",
      characterId: "mike-test",
      avatar: mikeAvatar,
      poseState,
      clientId: "c1",
      now: 1234,
    });

    expect(entry).toMatchObject({
      type: "say",
      mode: "say",
      actorId: "actor-1",
      nick: "Alice",
      text: "SO GREAT!!!",
      emotion: { emotion: "SHOUT" },
      characterId: "mike-test",
      pose: { kind: "complex", faceIndex: 1, torsoIndex: 0 },
      clientId: "c1",
      ts: 1234,
    });
    expect(poseState).toEqual({ lastFaceIndex: 1, lastTorsoIndex: 0, lastBodyIndex: -1 });
  });

  it("targetActorId를 넘기면 entry에 포함되고, 안 넘기면 필드 자체가 없다", () => {
    const withTarget = buildProvisionalEntry({
      text: "psst",
      mode: "whisper",
      targetActorId: "actor-2",
      selfActorId: "actor-1",
      nick: "Alice",
      characterId: "tux-test",
      avatar: tuxAvatar,
      poseState: createInitialPoseState(),
      clientId: "c1",
      now: 1,
    });
    expect(withTarget.targetActorId).toBe("actor-2");

    const withoutTarget = buildProvisionalEntry({
      text: "hi",
      mode: "say",
      selfActorId: "actor-1",
      nick: "Alice",
      characterId: "tux-test",
      avatar: tuxAvatar,
      poseState: createInitialPoseState(),
      clientId: "c2",
      now: 1,
    });
    expect("targetActorId" in withoutTarget).toBe(false);
  });

  it("simple 아바타는 pose.kind가 simple이다", () => {
    const entry = buildProvisionalEntry({
      text: "hi",
      mode: "say",
      selfActorId: "actor-1",
      nick: "Bob",
      characterId: "tux-test",
      avatar: tuxAvatar,
      poseState: createInitialPoseState(),
      clientId: "c1",
      now: 1,
    });
    expect(entry.pose).toEqual({ kind: "simple", bodyIndex: 0 });
  });
});

function entry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    type: "say",
    mode: "say",
    actorId: "actor-1",
    nick: "Alice",
    text: "hi",
    emotion: null,
    characterId: "mike-test",
    pose: { kind: "complex", faceIndex: 1, torsoIndex: 0 },
    ts: 1,
    ...overrides,
  };
}

describe("reconcilePending", () => {
  it("clientId가 일치하는 보류 항목을 제거하고 true를 돌려준다", () => {
    const pending = new Map<string, HistoryEntry>([["c1", entry({ clientId: "c1" })]]);
    const changed = reconcilePending(pending, [entry({ clientId: "c1" })], "actor-1", createInitialPoseState());
    expect(changed).toBe(true);
    expect(pending.size).toBe(0);
  });

  it("clientId가 없거나 일치하지 않는 확정 항목은 무시한다(변경 없음)", () => {
    const pending = new Map<string, HistoryEntry>([["c1", entry({ clientId: "c1" })]]);
    const changed = reconcilePending(pending, [entry({ clientId: undefined }), entry({ clientId: "other" })], "actor-1", createInitialPoseState());
    expect(changed).toBe(false);
    expect(pending.size).toBe(1);
  });

  it("내 actorId의 확정 entry면 canonical pose로 poseState를 재동기화한다", () => {
    const poseState = { lastFaceIndex: 5, lastTorsoIndex: 5, lastBodyIndex: 5 };
    const pending = new Map<string, HistoryEntry>([["c1", entry({ clientId: "c1" })]]);
    reconcilePending(
      pending,
      [entry({ clientId: "c1", actorId: "actor-1", pose: { kind: "complex", faceIndex: 2, torsoIndex: 0 } })],
      "actor-1",
      poseState,
    );
    expect(poseState).toEqual({ lastFaceIndex: 2, lastTorsoIndex: 0, lastBodyIndex: 5 });
  });

  it("다른 사람의 확정 entry는 pending에서 제거만 하고 poseState는 건드리지 않는다", () => {
    const poseState = { lastFaceIndex: 5, lastTorsoIndex: 5, lastBodyIndex: 5 };
    const pending = new Map<string, HistoryEntry>([["c1", entry({ clientId: "c1" })]]);
    const changed = reconcilePending(
      pending,
      [entry({ clientId: "c1", actorId: "someone-else" })],
      "actor-1",
      poseState,
    );
    expect(changed).toBe(true);
    expect(pending.size).toBe(0);
    expect(poseState).toEqual({ lastFaceIndex: 5, lastTorsoIndex: 5, lastBodyIndex: 5 });
  });

  it("simple 아바타(bodyIndex) 포즈로도 재동기화된다", () => {
    const poseState = { lastFaceIndex: -1, lastTorsoIndex: -1, lastBodyIndex: -1 };
    const pending = new Map<string, HistoryEntry>([["c1", entry({ clientId: "c1" })]]);
    reconcilePending(
      pending,
      [entry({ clientId: "c1", actorId: "actor-1", pose: { kind: "simple", bodyIndex: 3 } })],
      "actor-1",
      poseState,
    );
    expect(poseState.lastBodyIndex).toBe(3);
  });
});
