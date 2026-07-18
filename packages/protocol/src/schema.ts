import { ALL_EMOTION_IDS } from "@comic-chat/comic-engine";
import { z } from "zod";

// comic-engine의 EmotionId를 zod enum으로 재사용(타입과 값 목록이 어긋나지 않게 함).
const emotionIdSchema = z.enum(ALL_EMOTION_IDS as [string, ...string[]]);

// comic-engine의 EmotionCandidate와 대응. resolveEmotion()의 primary 후보가 없으면 null.
export const emotionCandidateSchema = z
  .object({
    emotion: emotionIdSchema,
    intensity: z.number(),
    priority: z.number(),
  })
  .nullable();

// comic-engine의 matchComplexPose/matchSimplePose 결과(Phase 2). 클라이언트는 이미 fetch해 둔
// 아바타 매니페스트에서 이 인덱스로 실제 이미지/위치값을 찾는다.
export const poseSelectionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("complex"), faceIndex: z.number().int().min(0), torsoIndex: z.number().int().min(0) }),
  z.object({ kind: z.literal("simple"), bodyIndex: z.number().int().min(0) }),
]);
export type PoseSelection = z.infer<typeof poseSelectionSchema>;

// ---- 클라이언트 → 서버 액션 ----

const joinActionSchema = z.object({
  type: z.literal("join"),
  nick: z.string().min(1).max(32),
  characterId: z.string().min(1),
});

const sayActionSchema = z.object({
  type: z.literal("say"),
  text: z.string().min(1).max(2000),
});

export const clientActionSchema = z.discriminatedUnion("type", [joinActionSchema, sayActionSchema]);
export type ClientAction = z.infer<typeof clientActionSchema>;

// ---- 서버 → 클라이언트 브로드캐스트 ----

// Phase 1은 "say" 한 종류만 다룬다. think/whisper/shout/action은 Phase 4에서 추가된다.
const sayHistoryEntrySchema = z.object({
  type: z.literal("say"),
  actorId: z.string(),
  nick: z.string(),
  text: z.string(),
  emotion: emotionCandidateSchema,
  characterId: z.string(),
  pose: poseSelectionSchema,
  ts: z.number(),
});

export const historyEntrySchema = sayHistoryEntrySchema;
export type HistoryEntry = z.infer<typeof historyEntrySchema>;

const memberSchema = z.object({
  actorId: z.string(),
  nick: z.string(),
  characterId: z.string(),
});
export type Member = z.infer<typeof memberSchema>;

const historyEntryMessageSchema = z.object({
  type: z.literal("historyEntry"),
  entry: historyEntrySchema,
});

const memberListMessageSchema = z.object({
  type: z.literal("memberList"),
  members: z.array(memberSchema),
});

export const serverMessageSchema = z.discriminatedUnion("type", [
  historyEntryMessageSchema,
  memberListMessageSchema,
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;
