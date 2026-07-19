import { clientActionSchema, type ServerMessage } from "@comic-chat/protocol";
import { WebSocketServer, type WebSocket } from "ws";
import { loadAvatarCatalog } from "./avatarCatalog.js";
import { EventStore } from "./eventStore.js";
import { DEFAULT_DB_PATH } from "./room.js";
import { RoomRegistry } from "./roomRegistry.js";

export function createServer(port: number): WebSocketServer {
  const registry = new RoomRegistry(loadAvatarCatalog(), new EventStore(DEFAULT_DB_PATH));
  const wss = new WebSocketServer({ port });

  wss.on("connection", (socket: WebSocket) => {
    let actorId: string | null = null;
    let roomId: string | null = null;

    const send = (message: ServerMessage): void => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
    };

    socket.on("message", (raw) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        return; // 파싱 실패한 메시지는 조용히 무시
      }

      const result = clientActionSchema.safeParse(parsed);
      if (!result.success) return;
      const action = result.data;

      if (action.type === "join") {
        if (actorId) return; // 이미 입장한 연결은 재입장 무시
        // irc.cpp의 JOIN: 존재하지 않는 roomId는 그 자리에서 새로 만든다(RoomRegistry.getOrCreate).
        const room = registry.getOrCreate(action.roomId);
        const client = room.join(action.nick, action.characterId, send);
        if (!client) return; // 존재하지 않는 characterId 또는 이 방에서 닉 중복
        actorId = client.actorId;
        roomId = action.roomId;
        return;
      }

      if (action.type === "switchRoom") {
        if (!actorId || !roomId) return; // join 전에는 방을 옮길 수 없다
        const oldRoom = registry.get(roomId);
        const me = oldRoom?.getMembers().find((m) => m.actorId === actorId);
        if (!oldRoom || !me) return;

        // irc.cpp의 ChatSwitchChannel: 이전 방은 나가고(PART에 대응) 같은 닉/캐릭터로 새 방에
        // 다시 들어간다(JOIN에 대응) — 새 방에서 닉이 이미 쓰이고 있으면 join과 동일하게 거부될
        // 수 있는데, 그 경우 원래 방 소속을 그대로 유지해야 하므로 실제로 나가기 전에 새 방의
        // 여유를 확인하지는 않고, 대신 실패해도 안전하도록 leave를 먼저 하지 않는다.
        const newRoom = registry.getOrCreate(action.roomId);
        const client = newRoom.join(me.nick, me.characterId, send);
        if (!client) {
          send({ type: "switchRoomRejected", reason: "nickTaken" });
          return;
        }
        registry.leaveAndCleanup(roomId, actorId);
        actorId = client.actorId;
        roomId = action.roomId;
        return;
      }

      if (action.type === "listRooms") {
        send({ type: "roomList", rooms: registry.list() });
        return;
      }

      if (action.type === "say") {
        if (!actorId || !roomId) return; // join 전에는 발화 불가
        registry.get(roomId)?.say(actorId, action.text, action.mode, action.targetActorId, action.clientId);
        return;
      }

      if (action.type === "changeNick") {
        if (!actorId || !roomId) return; // join 전에는 닉네임 변경 불가
        registry.get(roomId)?.changeNick(actorId, action.newNick);
      }
    });

    socket.on("close", () => {
      if (actorId && roomId) registry.leaveAndCleanup(roomId, actorId);
    });
  });

  return wss;
}
