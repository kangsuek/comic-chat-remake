import { ALL_EMOTION_IDS, ALL_SPEECH_MODES, type EmotionId, type SpeechMode } from "@comic-chat/comic-engine";
import { z } from "zod";

// comic-engine의 EmotionId를 zod enum으로 재사용(타입과 값 목록이 어긋나지 않게 함).
// 리터럴 유니온으로 캐스팅해야 z.infer 결과가 EmotionId 그대로 좁혀진다(그냥 string[]으로
// 캐스팅하면 타입이 string으로 넓어져, 이 값을 EmotionId를 요구하는 자리에 못 넘긴다).
const emotionIdSchema = z.enum(ALL_EMOTION_IDS as [EmotionId, ...EmotionId[]]);

// comic-engine의 SpeechMode(say/think/whisper/shout/action)를 그대로 재사용.
const speechModeSchema = z.enum(ALL_SPEECH_MODES as [SpeechMode, ...SpeechMode[]]);

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

// mode 생략 시 "say"로 취급(Phase 1~3 클라이언트와의 최소 호환). whisper는 targetActorId가
// 반드시 있어야 하는데, discriminatedUnion 멤버는 ZodEffects(.refine())를 못 받으므로 이 검증은
// clientActionSchema 전체에 얹는다(아래).
const sayActionSchema = z.object({
  type: z.literal("say"),
  text: z.string().min(1).max(2000),
  mode: speechModeSchema.default("say"),
  /** whisper일 때만 필요 — 그 외 모드에서는 무시된다. */
  targetActorId: z.string().min(1).optional(),
});

// irc.cpp의 "NICK <newnick>" 클라이언트 명령 포팅. 원작은 서버가 닉 변경을 승인하면 NICK 응답을
// 돌려보내고(ProcessNick), 이 처리는 멤버 목록만 갱신할 뿐 만화 패널에는 아무 흔적도 남기지
// 않는다(NickEntry는 세션 로그 재생용이지 CPanel/AddLine을 거치지 않음) — 그래서 이 액션도
// historyEntry가 아니라 memberList 갱신으로만 반영한다(아래 changeNick 서버 처리 참고).
const changeNickActionSchema = z.object({
  type: z.literal("changeNick"),
  newNick: z.string().min(1).max(32),
});

export const clientActionSchema = z
  .discriminatedUnion("type", [joinActionSchema, sayActionSchema, changeNickActionSchema])
  .refine((action) => action.type !== "say" || action.mode !== "whisper" || action.targetActorId !== undefined, {
    message: "whisper requires targetActorId",
    path: ["targetActorId"],
  });
export type ClientAction = z.infer<typeof clientActionSchema>;

// ---- 서버 → 클라이언트 브로드캐스트 ----

const sayHistoryEntrySchema = z.object({
  type: z.literal("say"),
  mode: speechModeSchema,
  actorId: z.string(),
  nick: z.string(),
  text: z.string(),
  emotion: emotionCandidateSchema,
  characterId: z.string(),
  pose: poseSelectionSchema,
  /** whisper일 때만 채워진다(발화모드 UI 표시 및 "OO님이 XX에게 귓속말" 문구용). */
  targetActorId: z.string().optional(),
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

// join 직후 한 번, 지금까지 쌓인 이벤트 로그를 통째로 재생하기 위해 보낸다(SQLite 영속화 도입 —
// Phase 3 2단계). 새로고침/재접속해도 이전 대화가 유지되는 것이 이 메시지의 목적.
const historyMessageSchema = z.object({
  type: z.literal("history"),
  entries: z.array(historyEntrySchema),
});

const memberListMessageSchema = z.object({
  type: z.literal("memberList"),
  members: z.array(memberSchema),
});

// join 성공 시 그 클라이언트에게만 한 번 보낸다 — 서버가 발급한 자기 actorId를 알려준다(예:
// 클라이언트가 memberList에서 "이 중 어떤 게 나인지" 닉네임만으로 추측할 필요가 없어짐,
// whisper 대상 목록에서 자기 자신을 제외할 때도 필요).
const joinedMessageSchema = z.object({
  type: z.literal("joined"),
  actorId: z.string(),
});

// irc.cpp의 431/432/433(닉네임 오류/중복) 응답 포팅 — 원작은 이 응답을 받으면 TryNewNick()으로
// 재입력 다이얼로그를 띄운다. 우리도 join이 조용히 무시되지 않도록 거부 사유를 명시적으로 알려준다.
const joinRejectedMessageSchema = z.object({
  type: z.literal("joinRejected"),
  reason: z.enum(["nickTaken", "invalidCharacter"]),
});

// 원작의 NICK 재요청과 동일한 이유로 거부될 수 있다(같은 방에 이미 있는 닉네임).
const changeNickRejectedMessageSchema = z.object({
  type: z.literal("changeNickRejected"),
  reason: z.enum(["nickTaken", "invalidNick"]),
});

export const serverMessageSchema = z.discriminatedUnion("type", [
  joinedMessageSchema,
  joinRejectedMessageSchema,
  changeNickRejectedMessageSchema,
  historyEntryMessageSchema,
  historyMessageSchema,
  memberListMessageSchema,
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;
