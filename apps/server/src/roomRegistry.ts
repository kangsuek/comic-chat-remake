import type { AvatarManifest } from "@comic-chat/asset-manifest-types";
import type { RoomSummary } from "@comic-chat/protocol";
import { EventStore } from "./eventStore.js";
import { Room } from "./room.js";

/**
 * irc.cpp의 JOIN(존재하지 않는 채널이면 그 자리에서 새로 만듦)/LIST(현재 사람이 있는 채널 목록)
 * 포팅. Room 인스턴스 자체는 Phase 4 1~3단계 동안 이미 "하나의 방"만 알던 구현 그대로 두고,
 * 이 클래스가 roomId별로 여러 Room을 지연 생성·추적한다. 모든 Room은 같은 EventStore를
 * 공유한다(EventStore가 이미 room_id 컬럼으로 방을 구분하도록 Phase 3에서 설계됐으므로 —
 * apps/server/src/eventStore.ts 참고) — 그래서 방이 메모리에서 정리돼도(leaveAndCleanup)
 * 대화 로그 자체는 SQLite에 그대로 남아 나중에 같은 roomId로 다시 들어오면 정확히 복구된다
 * (room.test.ts의 "서버 재시작" 시나리오와 동일한 메커니즘).
 */
export class RoomRegistry {
  private readonly rooms = new Map<string, Room>();

  constructor(
    private readonly avatarCatalog: Map<string, AvatarManifest>,
    private readonly eventStore: EventStore,
  ) {}

  getOrCreate(roomId: string): Room {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = new Room(this.avatarCatalog, this.eventStore, roomId);
      this.rooms.set(roomId, room);
    }
    return room;
  }

  get(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  /**
   * actorId를 room에서 내보내고, 그 결과 room에 아무도 안 남으면 메모리에서 완전히 정리한다.
   * SQLite 이벤트 로그는 그대로 남으므로 다음에 누가 같은 roomId로 들어오면 room_snapshot +
   * 나머지 이벤트를 재fold해 원래 상태 그대로 복구된다(Room 생성자 참고) — 정리해도 데이터
   * 유실이 없다.
   */
  leaveAndCleanup(roomId: string, actorId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.leave(actorId);
    if (room.getMembers().length === 0) this.rooms.delete(roomId);
  }

  /** irc.cpp의 LIST 포팅 — 지금 사람이 있는(=메모리에 로드된) 방만 돌려준다. */
  list(): RoomSummary[] {
    return [...this.rooms.entries()].map(([roomId, room]) => ({ roomId, memberCount: room.getMembers().length }));
  }
}
