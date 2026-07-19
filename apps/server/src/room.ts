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
  type SpeechMode,
} from "@comic-chat/comic-engine";
import type { HistoryEntry, Member, PoseSelection, ServerMessage } from "@comic-chat/protocol";
import { loadAvatarCatalog } from "./avatarCatalog.js";
import { EventStore } from "./eventStore.js";

const DEFAULT_DB_PATH = path.resolve(import.meta.dirname, "../data/events.db");

function toSayEvent(entry: HistoryEntry): SayEvent {
  return { actorId: entry.actorId, characterId: entry.characterId, mode: entry.mode, text: entry.text, pose: entry.pose };
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
 * foldEvents 순수 fold로 도출된다(plan.md의 이벤트소싱 설계). 생성자는 room_snapshot(있으면)
 * 이후분만 재fold해 복구하고, 이후에는 매 이벤트마다 증분 fold + 스냅샷 갱신을 함께 한다 —
 * "스냅샷+나머지 재fold" 경로와 "전체 재fold" 경로가 항상 같은 결과를 내는지는
 * fold.test.ts(comic-engine)와 room.test.ts의 재접속/스냅샷 시나리오로 검증한다.
 */
export class Room {
  private readonly rules: RuleSet = loadRules(defaultRuleDefinitions);
  private readonly avatarCatalog: Map<string, AvatarManifest>;
  private readonly clients = new Map<string, ConnectedClient>();
  private readonly poseStates = new Map<string, PoseState>();
  private readonly eventStore: EventStore;
  private readonly roomId: string;
  private fold: FoldResult;
  private lastSeq: number;

  constructor(
    avatarCatalog: Map<string, AvatarManifest> = loadAvatarCatalog(),
    eventStore: EventStore = new EventStore(DEFAULT_DB_PATH),
    roomId = "lobby",
  ) {
    this.avatarCatalog = avatarCatalog;
    this.eventStore = eventStore;
    this.roomId = roomId;

    // room_snapshot이 있으면 그 이후분만 재fold한다(오래 지속된 방을 매번 처음부터
    // 전부 fold하지 않도록 — 멀티룸에서 room을 지연 생성/정리하게 될 때를 대비).
    const snapshot = this.eventStore.loadSnapshot(roomId);
    const base = snapshot?.state ?? { panels: [], hysteresis: {} };
    const rest = this.eventStore.loadSince(roomId, snapshot?.seq ?? 0);
    this.fold = foldEvents(rest.map((r) => toSayEvent(r.entry)), base);
    this.lastSeq = rest.at(-1)?.seq ?? snapshot?.seq ?? 0;
  }

  /**
   * characterId가 카탈로그에 없거나 닉네임이 이미 이 방에서 쓰이고 있으면 입장을 거부한다(null
   * 반환) — irc.cpp의 431/432/433(닉/채널 오류) 응답을 포팅: 원작은 조용히 무시하지 않고
   * TryNewNick()으로 재입력을 요구하므로, 우리도 `send`로 거부 사유를 명시적으로 알려준다.
   */
  join(nick: string, characterId: string, send: ConnectedClient["send"]): ConnectedClient | null {
    if (!this.avatarCatalog.has(characterId)) {
      send({ type: "joinRejected", reason: "invalidCharacter" });
      return null;
    }
    const trimmedNick = nick.trim();
    if (this.isNickTaken(trimmedNick)) {
      send({ type: "joinRejected", reason: "nickTaken" });
      return null;
    }

    const client: ConnectedClient = { actorId: randomUUID(), nick: trimmedNick, characterId, send };
    this.clients.set(client.actorId, client);
    this.poseStates.set(client.actorId, { ...INITIAL_POSE_STATE });
    // 서버가 발급한 자기 actorId를 알려준다 — whisper 대상 선택 등에서 "나 자신"을 알아야 한다.
    send({ type: "joined", actorId: client.actorId });
    // 새로고침/재접속해도 이전 대화가 이어지도록, 지금까지의 로그를 이 클라이언트에게만 재생한다.
    // loadVisibleTo가 이 클라이언트가 관련 없는 whisper를 걸러준다(EventStore 참고).
    send({ type: "history", entries: this.eventStore.loadVisibleTo(this.roomId, client.actorId) });
    this.broadcastMemberList();
    return client;
  }

  leave(actorId: string): void {
    this.poseStates.delete(actorId);
    if (this.clients.delete(actorId)) {
      this.broadcastMemberList();
    }
  }

  /**
   * irc.cpp의 "NICK <newnick>" 명령 + ProcessNick 포팅. 원작은 닉네임 변경을 만화 패널에 전혀
   * 반영하지 않는다 — `NickEntry`는 세션 로그 재생용일 뿐 `ProcessNick`이 `CPanel`/`AddLine`을
   * 거치지 않고 멤버 목록만 갱신한다(irc.cpp 확인 완료). 그래서 여기서도 EventStore에 기록하지
   * 않고 in-memory 멤버 상태만 바꾼 뒤 memberList를 재브로드캐스트한다.
   */
  changeNick(actorId: string, newNick: string): void {
    const client = this.clients.get(actorId);
    if (!client) return;

    const trimmed = newNick.trim();
    if (!trimmed) {
      this.sendTo(actorId, { type: "changeNickRejected", reason: "invalidNick" });
      return;
    }
    if (trimmed === client.nick) return; // 원작 ProcessNick: stricmp로 실제 다를 때만 처리
    if (this.isNickTaken(trimmed, actorId)) {
      this.sendTo(actorId, { type: "changeNickRejected", reason: "nickTaken" });
      return;
    }

    client.nick = trimmed;
    this.broadcastMemberList();
  }

  /** 대소문자 구분 없이 비교한다(IRC 닉네임 관례 — 원작 곳곳의 stricmp 사용과 동일선상). */
  private isNickTaken(nick: string, excludeActorId?: string): boolean {
    const normalized = nick.toLowerCase();
    for (const client of this.clients.values()) {
      if (client.actorId === excludeActorId) continue;
      if (client.nick.toLowerCase() === normalized) return true;
    }
    return false;
  }

  /**
   * mode==="whisper"일 때는 targetActorId가 필수(프로토콜에서 이미 강제됨)이고, 발신자와
   * 대상에게만 브로드캐스트한다 — 그 외 모드는 기존처럼 방 전체에 브로드캐스트한다.
   */
  say(actorId: string, text: string, mode: SpeechMode = "say", targetActorId?: string): HistoryEntry | null {
    const client = this.clients.get(actorId);
    const avatar = client && this.avatarCatalog.get(client.characterId);
    const poseState = this.poseStates.get(actorId);
    if (!client || !avatar || !poseState) return null;
    if (mode === "whisper" && !targetActorId) return null;

    // AI 캐릭터(Phase 5)도 이 진입점을 그대로 호출해야, 인간과 동일한 감정 인식·
    // 포즈 매칭·패널 배치 파이프라인을 통과한다(plan.md의 핵심 설계 결정).
    const resolution = resolveEmotion(text, this.rules);
    const pose = this.matchPose(avatar, resolution.candidates, poseState);

    const entry: HistoryEntry = {
      type: "say",
      mode,
      actorId: client.actorId,
      nick: client.nick,
      text,
      emotion: resolution.primary,
      characterId: client.characterId,
      pose,
      ...(targetActorId ? { targetActorId } : {}),
      ts: Date.now(),
    };
    this.lastSeq = this.eventStore.append(this.roomId, entry);
    this.fold = foldEvents([toSayEvent(entry)], this.fold);
    this.eventStore.saveSnapshot(this.roomId, this.lastSeq, this.fold);

    if (mode === "whisper") {
      this.sendTo(client.actorId, { type: "historyEntry", entry });
      if (targetActorId !== client.actorId) this.sendTo(targetActorId!, { type: "historyEntry", entry });
    } else {
      this.broadcast({ type: "historyEntry", entry });
    }
    return entry;
  }

  getMembers(): Member[] {
    return [...this.clients.values()].map((c) => ({ actorId: c.actorId, nick: c.nick, characterId: c.characterId }));
  }

  /**
   * Stage 3(Konva 다중 body 패널 렌더링)에서 소비할 지점. 지금은 아직 아무도 읽지 않는다.
   * **주의**: `this.fold`는 EventStore.loadAll(필터 없음) 기반이라 whisper도 전부 포함된
   * "신 관점" 상태다 — 나중에 이 값을 클라이언트에게 그대로 보내는 기능을 만들면 반드시
   * 뷰어별로 다시 걸러야 한다(각 클라이언트는 이미 loadVisibleTo로 받은 자기 몫의 entries만
   * 가지고 스스로 foldEvents를 돌리므로, 지금처럼 서버가 각자 계산해서 안 보내는 한 문제없다).
   */
  getPanels(): readonly Panel[] {
    return this.fold.panels;
  }

  /**
   * avatar.cpp의 GetBodyFromEmotion(CEmotionOpts&) 포팅 지점. 매칭 직후 즉시 라운드로빈
   * 상태를 갱신한다 — 원작은 이 갱신을 패널 배치 확정 시점(RecordBody, panel.cpp의
   * FetchSpeaker/ReplaceBody)에 하지만, Phase 3 완료 후 panel.cpp의 AddLine을 재대조해
   * 두 시점이 항상 동치임을 확인했다: AddLine은 새 패널/클론 패널을 만들 때
   * `oldP->AvatarInPanel(id)`가 참이면 반드시 새 패널을 시작하므로, 현재 화자 id는
   * FetchSpeaker(newP) 시점에 newP->m_bodies에 결코 이미 존재할 수 없다 — 즉 FetchSpeaker의
   * "이미 있음" 조기 반환(=RecordBody 미호출) 분기는 현재 줄의 화자에 대해서는 절대
   * 일어나지 않는다. 뒤이은 ReplaceBody(id) 호출도 같은 av->m_body를 다시 클론해
   * RecordBody를 한 번 더(동일 인덱스로, 멱등) 호출할 뿐이다. 레이아웃 실패로
   * StartNewPanel()+AddLine() 재귀 재시도가 일어나도 av->m_body가 그사이 바뀌지 않으므로
   * 결과는 동일하다. 따라서 "메시지 하나 = 매칭 즉시 확정"으로 매번 갱신하는 이 구현은
   * 원작과 항상 같은 순서를 관찰한다(2026-07-19 재검증, 이전엔 "Phase 3 이후 재검토
   * 필요"로 남겨뒀던 항목).
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

  /** 특정 접속자 한 명에게만 보낸다(whisper). 그 사람이 이미 나갔으면 조용히 무시한다. */
  private sendTo(actorId: string, message: ServerMessage): void {
    this.clients.get(actorId)?.send(message);
  }
}
