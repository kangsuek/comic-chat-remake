import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { HistoryEntry } from "@comic-chat/protocol";

interface EventRow {
  payload_json: string;
}

/**
 * SQLite(append-only) 이벤트 로그. plan.md의 이벤트소싱 설계대로 room_id/seq로 정렬된
 * historyEntry 원문을 그대로 저장한다 — 감정/포즈처럼 이미 계산된 결과가 payload에 이미
 * 포함되어 있으므로(Room.say 참고) replay 시 재계산이 필요 없다.
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
    `);
  }

  append(roomId: string, entry: HistoryEntry): void {
    const seq = this.nextSeq(roomId);
    this.db
      .prepare(
        `INSERT INTO events (room_id, seq, ts, actor_id, type, payload_json) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(roomId, seq, entry.ts, entry.actorId, entry.type, JSON.stringify(entry));
  }

  loadAll(roomId: string): HistoryEntry[] {
    const rows = this.db
      .prepare(`SELECT payload_json FROM events WHERE room_id = ? ORDER BY seq ASC`)
      .all(roomId) as EventRow[];
    return rows.map((row) => JSON.parse(row.payload_json) as HistoryEntry);
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
