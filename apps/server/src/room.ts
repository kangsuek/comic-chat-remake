import { randomUUID } from "node:crypto";
import path from "node:path";
import type { AvatarManifest } from "@comic-chat/asset-manifest-types";
import {
  defaultRuleDefinitions,
  foldEvents,
  loadRules,
  matchComplexPose,
  matchSimplePose,
  resolveEmotion,
  type EmotionCandidate,
  type FoldResult,
  type Panel,
  type RuleSet,
  type SayEvent,
} from "@comic-chat/comic-engine";
import type { HistoryEntry, Member, PoseSelection, ServerMessage } from "@comic-chat/protocol";
import { loadAvatarCatalog } from "./avatarCatalog.js";
import { EventStore } from "./eventStore.js";

const DEFAULT_DB_PATH = path.resolve(import.meta.dirname, "../data/events.db");

function toSayEvent(entry: HistoryEntry): SayEvent {
  return { actorId: entry.actorId, characterId: entry.characterId, mode: entry.type, text: entry.text, pose: entry.pose };
}

export interface ConnectedClient {
  actorId: string;
  nick: string;
  characterId: string;
  send: (message: ServerMessage) => void;
}

/** avatar.cpp의 m_lastFace/m_lastTorso/m_lastBody(NEUTRAL 폴백용 라운드로빈 시작점) 포팅. */
interface PoseState {
  lastFaceIndex: number;
  lastTorsoIndex: number;
  lastBodyIndex: number;
}

const INITIAL_POSE_STATE: PoseState = { lastFaceIndex: -1, lastTorsoIndex: -1, lastBodyIndex: -1 };

/**
 * 단일 room("lobby")의 멤버/이벤트 로그를 관리한다.
 * 이벤트는 SQLite(EventStore)에 append-only로 영속화되고, 방 상태(패널 목록)는 항상 그 로그의
 * foldEvents 순수 fold로 도출된다(plan.md의 이벤트소싱 설계). 서버 재시작 시 생성자에서
 * 기존 로그 전체를 한 번 fold해 복구하고, 이후에는 새 이벤트 하나씩 증분 fold한다 — 두 경로가
 * 항상 같은 결과를 내는지는 fold.test.ts(comic-engine)와 room.test.ts의 재접속 시나리오로 검증한다.
 */
export class Room {
  private readonly rules: RuleSet = loadRules(defaultRuleDefinitions);
  private readonly avatarCatalog: Map<string, AvatarManifest>;
  private readonly clients = new Map<string, ConnectedClient>();
  private readonly poseStates = new Map<string, PoseState>();
  private readonly eventStore: EventStore;
  private readonly roomId: string;
  private fold: FoldResult;

  constructor(
    avatarCatalog: Map<string, AvatarManifest> = loadAvatarCatalog(),
    eventStore: EventStore = new EventStore(DEFAULT_DB_PATH),
    roomId = "lobby",
  ) {
    this.avatarCatalog = avatarCatalog;
    this.eventStore = eventStore;
    this.roomId = roomId;
    this.fold = foldEvents(this.eventStore.loadAll(roomId).map(toSayEvent));
  }

  /** characterId가 카탈로그에 없으면 입장을 거부한다(null 반환). */
  join(nick: string, characterId: string, send: ConnectedClient["send"]): ConnectedClient | null {
    if (!this.avatarCatalog.has(characterId)) return null;

    const client: ConnectedClient = { actorId: randomUUID(), nick, characterId, send };
    this.clients.set(client.actorId, client);
    this.poseStates.set(client.actorId, { ...INITIAL_POSE_STATE });
    // 새로고침/재접속해도 이전 대화가 이어지도록, 지금까지의 로그를 이 클라이언트에게만 재생한다.
    send({ type: "history", entries: this.eventStore.loadAll(this.roomId) });
    this.broadcastMemberList();
    return client;
  }

  leave(actorId: string): void {
    this.poseStates.delete(actorId);
    if (this.clients.delete(actorId)) {
      this.broadcastMemberList();
    }
  }

  say(actorId: string, text: string): HistoryEntry | null {
    const client = this.clients.get(actorId);
    const avatar = client && this.avatarCatalog.get(client.characterId);
    const poseState = this.poseStates.get(actorId);
    if (!client || !avatar || !poseState) return null;

    // AI 캐릭터(Phase 5)도 이 진입점을 그대로 호출해야, 인간과 동일한 감정 인식·
    // 포즈 매칭·패널 배치 파이프라인을 통과한다(plan.md의 핵심 설계 결정).
    const resolution = resolveEmotion(text, this.rules);
    const pose = this.matchPose(avatar, resolution.candidates, poseState);

    const entry: HistoryEntry = {
      type: "say",
      actorId: client.actorId,
      nick: client.nick,
      text,
      emotion: resolution.primary,
      characterId: client.characterId,
      pose,
      ts: Date.now(),
    };
    this.eventStore.append(this.roomId, entry);
    this.fold = foldEvents([toSayEvent(entry)], this.fold);
    this.broadcast({ type: "historyEntry", entry });
    return entry;
  }

  getMembers(): Member[] {
    return [...this.clients.values()].map((c) => ({ actorId: c.actorId, nick: c.nick, characterId: c.characterId }));
  }

  /** Stage 3(Konva 다중 body 패널 렌더링)에서 소비할 지점. 지금은 아직 아무도 읽지 않는다. */
  getPanels(): readonly Panel[] {
    return this.fold.panels;
  }

  /**
   * avatar.cpp의 GetBodyFromEmotion(CEmotionOpts&) 포팅 지점. 매칭 후 라운드로빈 상태를
   * 갱신한다 — 원작은 이 갱신을 패널에 실제 배치가 확정될 때(RecordBody, panel.cpp) 하지만
   * Phase 2는 패널 배치가 없으므로 "메시지 하나 = 확정"으로 간주해 매번 갱신한다
   * (Phase 3에서 패널 클론/백트래킹이 들어오면 재검토).
   */
  private matchPose(avatar: AvatarManifest, candidates: readonly EmotionCandidate[], poseState: PoseState): PoseSelection {
    if (avatar.kind === "complex") {
      const { faceIndex, torsoIndex } = matchComplexPose(
        candidates,
        avatar.faces,
        avatar.torsos,
        poseState.lastFaceIndex,
        poseState.lastTorsoIndex,
      );
      poseState.lastFaceIndex = faceIndex;
      poseState.lastTorsoIndex = torsoIndex;
      return { kind: "complex", faceIndex, torsoIndex };
    }

    const { bodyIndex } = matchSimplePose(candidates, avatar.bodies, poseState.lastBodyIndex);
    poseState.lastBodyIndex = bodyIndex;
    return { kind: "simple", bodyIndex };
  }

  private broadcastMemberList(): void {
    this.broadcast({ type: "memberList", members: this.getMembers() });
  }

  private broadcast(message: ServerMessage): void {
    for (const client of this.clients.values()) {
      client.send(message);
    }
  }
}
