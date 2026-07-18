import { describe, expect, it } from "vitest";
import { clientActionSchema, serverMessageSchema } from "./schema.js";

describe("clientActionSchema", () => {
  it("join 액션을 허용한다", () => {
    const result = clientActionSchema.safeParse({ type: "join", nick: "Alice" });
    expect(result.success).toBe(true);
  });

  it("say 액션을 허용한다", () => {
    const result = clientActionSchema.safeParse({ type: "say", text: "Hello!" });
    expect(result.success).toBe(true);
  });

  it("빈 닉네임/텍스트는 거부한다", () => {
    expect(clientActionSchema.safeParse({ type: "join", nick: "" }).success).toBe(false);
    expect(clientActionSchema.safeParse({ type: "say", text: "" }).success).toBe(false);
  });

  it("알 수 없는 type은 거부한다", () => {
    const result = clientActionSchema.safeParse({ type: "whisper", text: "hi" });
    expect(result.success).toBe(false);
  });
});

describe("serverMessageSchema", () => {
  it("historyEntry 메시지를 허용한다", () => {
    const result = serverMessageSchema.safeParse({
      type: "historyEntry",
      entry: {
        type: "say",
        actorId: "actor-1",
        nick: "Alice",
        text: "SO GREAT!!!",
        emotion: { emotion: "SHOUT", intensity: 1, priority: 9 },
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
        ts: 1234567890,
      },
    });
    expect(result.success).toBe(true);
  });

  it("memberList 메시지를 허용한다", () => {
    const result = serverMessageSchema.safeParse({
      type: "memberList",
      members: [{ actorId: "actor-1", nick: "Alice" }],
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
        ts: 1,
      },
    });
    expect(result.success).toBe(false);
  });
});
