import { randomUUID } from "node:crypto";
import { defaultRuleDefinitions, loadRules, resolveEmotion, type RuleSet } from "@comic-chat/comic-engine";
import type { HistoryEntry, Member, ServerMessage } from "@comic-chat/protocol";

export interface ConnectedClient {
  actorId: string;
  nick: string;
  send: (message: ServerMessage) => void;
}

/**
 * 단일 room("lobby")의 멤버/이벤트 로그를 관리한다.
 * 인메모리 배열로 이벤트를 쌓는다 — 영속화(SQLite)는 Phase 3에서 도입한다.
 */
export class Room {
  private readonly rules: RuleSet = loadRules(defaultRuleDefinitions);
  private readonly clients = new Map<string, ConnectedClient>();
  private readonly eventLog: HistoryEntry[] = [];

  join(nick: string, send: ConnectedClient["send"]): ConnectedClient {
    const client: ConnectedClient = { actorId: randomUUID(), nick, send };
    this.clients.set(client.actorId, client);
    this.broadcastMemberList();
    return client;
  }

  leave(actorId: string): void {
    if (this.clients.delete(actorId)) {
      this.broadcastMemberList();
    }
  }

  say(actorId: string, text: string): HistoryEntry | null {
    const client = this.clients.get(actorId);
    if (!client) return null;

    // AI 캐릭터(Phase 5)도 이 진입점을 그대로 호출해야, 인간과 동일한 감정 인식·
    // 포즈 매칭·패널 배치 파이프라인을 통과한다(plan.md의 핵심 설계 결정).
    const resolution = resolveEmotion(text, this.rules);
    const entry: HistoryEntry = {
      type: "say",
      actorId: client.actorId,
      nick: client.nick,
      text,
      emotion: resolution.primary,
      ts: Date.now(),
    };
    this.eventLog.push(entry);
    this.broadcast({ type: "historyEntry", entry });
    return entry;
  }

  getMembers(): Member[] {
    return [...this.clients.values()].map((c) => ({ actorId: c.actorId, nick: c.nick }));
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
