import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { FoldResult } from "@comic-chat/comic-engine";
import type { HistoryEntry } from "@comic-chat/protocol";

interface EventRow {
  seq: number;
  payload_json: string;
}

interface SnapshotRow {
  seq: number;
  state_json: string;
}

export interface StoredEvent {
  seq: number;
  entry: HistoryEntry;
}

export interface RoomSnapshot {
  seq: number;
  state: FoldResult;
}

/**
 * SQLite(append-only) 이벤트 로그. plan.md의 이벤트소싱 설계대로 room_id/seq로 정렬된
 * historyEntry 원문을 그대로 저장한다 — 감정/포즈처럼 이미 계산된 결과가 payload에 이미
 * 포함되어 있으므로(Room.say 참고) replay 시 재계산이 필요 없다.
 *
 * room_snapshot은 foldEvents()로 계산한 FoldResult(패널 상태)를 특정 seq 시점에 캐싱한다.
 * 멀티룸(Phase 4)에서 오래 지속된 방을 다시 열 때 이벤트 전체를 처음부터 재fold하지 않고
 * "마지막 스냅샷 이후"만 fold하도록 restore 비용을 O(전체 이벤트) 대신 O(스냅샷 이후 이벤트)로
 * 줄이기 위한 캐시다. 지금(단일 room, Room이 프로세스 수명 내내 메모리에 상주)은 서버
 * 재시작 시점에만 효과가 있지만, Phase 4에서 room을 접속 시 지연 생성/유휴 시 정리하게 되면
 * 매번 이 캐시가 재fold 비용을 줄여준다.
 *
 * 무효화는 따로 하지 않는다 — state_json은 foldEvents()의 순수 출력(Panel[] + 히스테리시스)이고
 * 아직 폭/줌 같은 렌더링 파라미터에 의존하지 않는다(zoom.ts의 layoutBodies는 Stage 3에서
 * 렌더 시점에만 호출됨, docs/phases/03 참고). 그 의존성이 생기면 그때 스냅샷에 입력 해시나
 * 버전을 같이 저장해 무효화하면 된다.
 */
export class EventStore {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    if (dbPath !== ":memory:") mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        ts INTEGER NOT NULL,
        actor_id TEXT NOT NULL,
        type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        UNIQUE(room_id, seq)
      );

      CREATE TABLE IF NOT EXISTS room_snapshot (
        room_id TEXT PRIMARY KEY,
        seq INTEGER NOT NULL,
        state_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
  }

  /** 새 이벤트를 append하고 이 room 안에서 부여된 seq를 돌려준다. */
  append(roomId: string, entry: HistoryEntry): number {
    const seq = this.nextSeq(roomId);
    this.db
      .prepare(
        `INSERT INTO events (room_id, seq, ts, actor_id, type, payload_json) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(roomId, seq, entry.ts, entry.actorId, entry.type, JSON.stringify(entry));
    return seq;
  }

  loadAll(roomId: string): HistoryEntry[] {
    const rows = this.db
      .prepare(`SELECT payload_json FROM events WHERE room_id = ? ORDER BY seq ASC`)
      .all(roomId) as EventRow[];
    return rows.map((row) => JSON.parse(row.payload_json) as HistoryEntry);
  }

  /** sinceSeq보다 큰 이벤트만 seq와 함께 돌려준다 — 스냅샷 이후분만 재fold할 때 쓴다. */
  loadSince(roomId: string, sinceSeq: number): StoredEvent[] {
    const rows = this.db
      .prepare(`SELECT seq, payload_json FROM events WHERE room_id = ? AND seq > ? ORDER BY seq ASC`)
      .all(roomId, sinceSeq) as EventRow[];
    return rows.map((row) => ({ seq: row.seq, entry: JSON.parse(row.payload_json) as HistoryEntry }));
  }

  saveSnapshot(roomId: string, seq: number, state: FoldResult): void {
    this.db
      .prepare(
        `INSERT INTO room_snapshot (room_id, seq, state_json, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(room_id) DO UPDATE SET seq = excluded.seq, state_json = excluded.state_json, updated_at = excluded.updated_at`,
      )
      .run(roomId, seq, JSON.stringify(state), Date.now());
  }

  loadSnapshot(roomId: string): RoomSnapshot | null {
    const row = this.db
      .prepare(`SELECT seq, state_json FROM room_snapshot WHERE room_id = ?`)
      .get(roomId) as SnapshotRow | undefined;
    return row ? { seq: row.seq, state: JSON.parse(row.state_json) as FoldResult } : null;
  }

  close(): void {
    this.db.close();
  }

  private nextSeq(roomId: string): number {
    const row = this.db
      .prepare(`SELECT MAX(seq) as maxSeq FROM events WHERE room_id = ?`)
      .get(roomId) as { maxSeq: number | null };
    return (row.maxSeq ?? 0) + 1;
  }
}
