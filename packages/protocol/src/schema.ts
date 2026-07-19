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

// irc.cpp의 JOIN 명령 포팅: 존재하지 않는 채널에 JOIN하면 서버가 그 자리에서 새로 만든다
// (별도 "방 생성" 명령이 원작에 없음) — 그래서 roomId는 "입장 또는 생성"을 겸한다.
// 생략 시 "lobby"로 취급해 Phase 1~4 3단계까지의 단일 방 클라이언트와 호환된다.
const joinActionSchema = z.object({
  type: z.literal("join"),
  nick: z.string().min(1).max(32),
  characterId: z.string().min(1),
  roomId: z.string().min(1).max(64).default("lobby"),
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
  /**
   * 낙관적 업데이트(Phase 4 3단계)용 클라이언트 임의 식별자 — 서버는 의미를 해석하지 않고
   * 그대로 historyEntry에 실어 되돌려준다. 클라이언트는 이 값으로 "방금 내가 로컬로 미리
   * 그려둔 잠정 패널"과 "서버가 확정해 돌려준 진짜 결과"를 짝지어 교체(reconcile)한다.
   */
  clientId: z.string().min(1).optional(),
});

// irc.cpp의 "NICK <newnick>" 클라이언트 명령 포팅. 원작은 서버가 닉 변경을 승인하면 NICK 응답을
// 돌려보내고(ProcessNick), 이 처리는 멤버 목록만 갱신할 뿐 만화 패널에는 아무 흔적도 남기지
// 않는다(NickEntry는 세션 로그 재생용이지 CPanel/AddLine을 거치지 않음) — 그래서 이 액션도
// historyEntry가 아니라 memberList 갱신으로만 반영한다(아래 changeNick 서버 처리 참고).
const changeNickActionSchema = z.object({
  type: z.literal("changeNick"),
  newNick: z.string().min(1).max(32),
});

// irc.cpp의 ChatSwitchChannel 포팅: 원작은 채널을 바꾸면 문서를 통째로 새로 열어(ID_FILE_NEW)
// 만화를 처음부터 다시 시작한다 — 우리도 이전 방은 나가고(leave) 새 방에 같은 닉/캐릭터로
// 다시 입장한다(server.ts). 새 방에서 닉이 이미 쓰이고 있으면 join과 동일하게 거부될 수 있다.
const switchRoomActionSchema = z.object({
  type: z.literal("switchRoom"),
  roomId: z.string().min(1).max(64),
});

// irc.cpp의 "LIST" 명령(RPL_LIST/RPL_LISTEND) 포팅 — 현재 사람이 있는 방 목록을 요청한다.
const listRoomsActionSchema = z.object({
  type: z.literal("listRooms"),
});

// saywnd.cpp의 CSayCtrl::OnChar 포팅: 빈 메시지 상태에서 Enter를 치면(원작의 "<Chr>") 말풍선 없이
// 현재 반응 포즈만 패널에 반영한다. text/mode/targetActorId가 없다 — 리액션은 항상 무언이다.
const reactActionSchema = z.object({
  type: z.literal("react"),
});

export const clientActionSchema = z
  .discriminatedUnion("type", [
    joinActionSchema,
    sayActionSchema,
    changeNickActionSchema,
    switchRoomActionSchema,
    listRoomsActionSchema,
    reactActionSchema,
  ])
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
  /** 발신자가 sayActionSchema에 실어 보낸 clientId를 그대로 통과시킨 값(낙관적 업데이트 재조정용). */
  clientId: z.string().optional(),
  ts: z.number(),
});

// panel.cpp의 AddReaction(id) 포팅 결과 — 말풍선이 없다는 점이 sayHistoryEntrySchema와의
// 유일한 본질적 차이다(text/emotion/mode/targetActorId/clientId 전부 해당 없음).
const reactionHistoryEntrySchema = z.object({
  type: z.literal("reaction"),
  actorId: z.string(),
  nick: z.string(),
  characterId: z.string(),
  pose: poseSelectionSchema,
  ts: z.number(),
});

export const historyEntrySchema = z.discriminatedUnion("type", [sayHistoryEntrySchema, reactionHistoryEntrySchema]);
export type HistoryEntry = z.infer<typeof historyEntrySchema>;
export type SayHistoryEntry = z.infer<typeof sayHistoryEntrySchema>;
export type ReactionHistoryEntry = z.infer<typeof reactionHistoryEntrySchema>;

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

// join(또는 switchRoom) 성공 시 그 클라이언트에게만 한 번 보낸다 — 서버가 발급한 자기 actorId와
// 지금 들어와 있는 roomId를 알려준다(예: 클라이언트가 memberList에서 "이 중 어떤 게 나인지"
// 닉네임만으로 추측할 필요가 없어짐, whisper 대상 목록에서 자기 자신을 제외할 때도 필요,
// switchRoom 후에는 이 메시지로 "새 방으로 전환 완료"를 알아채고 이전 방의 entries/members를
// 비운다).
const joinedMessageSchema = z.object({
  type: z.literal("joined"),
  actorId: z.string(),
  roomId: z.string(),
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

// switchRoom이 거부되면(새 방에서 닉 중복) 원래 방 소속은 그대로 유지된다 — 클라이언트는 이
// 메시지를 받으면 화면 전환 없이 오류만 보여주면 된다.
const switchRoomRejectedMessageSchema = z.object({
  type: z.literal("switchRoomRejected"),
  reason: z.literal("nickTaken"),
});

const roomSummarySchema = z.object({
  roomId: z.string(),
  memberCount: z.number().int().min(0),
});
export type RoomSummary = z.infer<typeof roomSummarySchema>;

// listRoomsActionSchema에 대한 응답 — 원작 LIST 명령(RPL_LIST 반복 + RPL_LISTEND)을 배열 하나로
// 뭉쳐서 돌려준다(우리는 요청-응답 한 번으로 충분, 스트리밍할 이유가 없음).
const roomListMessageSchema = z.object({
  type: z.literal("roomList"),
  rooms: z.array(roomSummarySchema),
});

export const serverMessageSchema = z.discriminatedUnion("type", [
  joinedMessageSchema,
  joinRejectedMessageSchema,
  changeNickRejectedMessageSchema,
  switchRoomRejectedMessageSchema,
  roomListMessageSchema,
  historyEntryMessageSchema,
  historyMessageSchema,
  memberListMessageSchema,
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;
