import { describe, expect, it } from "vitest";
import { clientActionSchema, serverMessageSchema } from "./schema.js";

describe("clientActionSchema", () => {
  it("join 액션을 허용한다", () => {
    const result = clientActionSchema.safeParse({ type: "join", nick: "Alice", characterId: "mike" });
    expect(result.success).toBe(true);
  });

  it("say 액션을 허용한다", () => {
    const result = clientActionSchema.safeParse({ type: "say", text: "Hello!" });
    expect(result.success).toBe(true);
  });

  it("빈 닉네임/텍스트/캐릭터ID는 거부한다", () => {
    expect(clientActionSchema.safeParse({ type: "join", nick: "", characterId: "mike" }).success).toBe(false);
    expect(clientActionSchema.safeParse({ type: "join", nick: "Alice", characterId: "" }).success).toBe(false);
    expect(clientActionSchema.safeParse({ type: "say", text: "" }).success).toBe(false);
  });

  it("알 수 없는 type은 거부한다", () => {
    const result = clientActionSchema.safeParse({ type: "whisper", text: "hi" });
    expect(result.success).toBe(false);
  });
});

describe("serverMessageSchema", () => {
  it("historyEntry 메시지(complex 포즈)를 허용한다", () => {
    const result = serverMessageSchema.safeParse({
      type: "historyEntry",
      entry: {
        type: "say",
        actorId: "actor-1",
        nick: "Alice",
        text: "SO GREAT!!!",
        emotion: { emotion: "SHOUT", intensity: 1, priority: 9 },
        characterId: "mike",
        pose: { kind: "complex", faceIndex: 8, torsoIndex: 1 },
        ts: 1234567890,
      },
    });
    expect(result.success).toBe(true);
  });

  it("historyEntry 메시지(simple 포즈)를 허용한다", () => {
    const result = serverMessageSchema.safeParse({
      type: "historyEntry",
      entry: {
        type: "say",
        actorId: "actor-1",
        nick: "Bob",
        text: "hi",
        emotion: null,
        characterId: "tux",
        pose: { kind: "simple", bodyIndex: 0 },
        ts: 1234567890,
      },
    });
    expect(result.success).toBe(true);
  });

  it("emotion이 null인 historyEntry도 허용한다", () => {
    const result = serverMessageSchema.safeParse({
      type: "historyEntry",
      entry: {
        type: "say",
        actorId: "actor-1",
        nick: "Alice",
        text: "just a plain sentence",
        emotion: null,
        characterId: "mike",
        pose: { kind: "complex", faceIndex: 0, torsoIndex: 0 },
        ts: 1234567890,
      },
    });
    expect(result.success).toBe(true);
  });

  it("history 메시지(빈 배열 포함)를 허용한다", () => {
    expect(serverMessageSchema.safeParse({ type: "history", entries: [] }).success).toBe(true);

    const result = serverMessageSchema.safeParse({
      type: "history",
      entries: [
        {
          type: "say",
          actorId: "actor-1",
          nick: "Alice",
          text: "hi",
          emotion: null,
          characterId: "mike",
          pose: { kind: "simple", bodyIndex: 0 },
          ts: 1234567890,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("memberList 메시지를 허용한다", () => {
    const result = serverMessageSchema.safeParse({
      type: "memberList",
      members: [{ actorId: "actor-1", nick: "Alice", characterId: "mike" }],
    });
    expect(result.success).toBe(true);
  });

  it("알 수 없는 emotion 값은 거부한다", () => {
    const result = serverMessageSchema.safeParse({
      type: "historyEntry",
      entry: {
        type: "say",
        actorId: "actor-1",
        nick: "Alice",
        text: "hi",
        emotion: { emotion: "NOT_A_REAL_EMOTION", intensity: 1, priority: 9 },
        characterId: "mike",
        pose: { kind: "complex", faceIndex: 0, torsoIndex: 0 },
        ts: 1,
      },
    });
    expect(result.success).toBe(false);
  });

  it("음수 인덱스의 pose는 거부한다", () => {
    const result = serverMessageSchema.safeParse({
      type: "historyEntry",
      entry: {
        type: "say",
        actorId: "actor-1",
        nick: "Alice",
        text: "hi",
        emotion: null,
        characterId: "mike",
        pose: { kind: "simple", bodyIndex: -1 },
        ts: 1,
      },
    });
    expect(result.success).toBe(false);
  });
});
