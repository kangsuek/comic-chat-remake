import { clientActionSchema, type ServerMessage } from "@comic-chat/protocol";
import { WebSocketServer, type WebSocket } from "ws";
import { Room } from "./room.js";

export function createServer(port: number): WebSocketServer {
  const room = new Room();
  const wss = new WebSocketServer({ port });

  wss.on("connection", (socket: WebSocket) => {
    let actorId: string | null = null;

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
        actorId = room.join(action.nick, send).actorId;
        return;
      }

      if (action.type === "say") {
        if (!actorId) return; // join 전에는 발화 불가
        room.say(actorId, action.text);
      }
    });

    socket.on("close", () => {
      if (actorId) room.leave(actorId);
    });
  });

  return wss;
}
