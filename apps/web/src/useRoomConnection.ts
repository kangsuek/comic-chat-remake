import type { SpeechMode } from "@comic-chat/comic-engine";
import {
  clientActionSchema,
  serverMessageSchema,
  type ClientAction,
  type HistoryEntry,
  type Member,
} from "@comic-chat/protocol";
import { useCallback, useEffect, useRef, useState } from "react";

export type ConnectionStatus = "connecting" | "open" | "closed";

export interface RoomConnection {
  status: ConnectionStatus;
  members: Member[];
  entries: HistoryEntry[];
  /** 서버가 발급한 내 actorId — join 성공 시 "joined" 메시지로 받는다. join 전에는 null. */
  selfActorId: string | null;
  join: (nick: string, characterId: string) => void;
  say: (text: string, mode?: SpeechMode, targetActorId?: string) => void;
}

/** WS 연결을 유지하며 서버 브로드캐스트(historyEntry/memberList)로 상태를 갱신하는 훅. */
export function useRoomConnection(url: string): RoomConnection {
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [members, setMembers] = useState<Member[]>([]);
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [selfActorId, setSelfActorId] = useState<string | null>(null);

  useEffect(() => {
    setStatus("connecting");
    setMembers([]);
    setEntries([]);
    setSelfActorId(null);

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.addEventListener("open", () => setStatus("open"));
    ws.addEventListener("close", () => setStatus("closed"));
    ws.addEventListener("message", (event) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(event.data as string);
      } catch {
        return;
      }
      const result = serverMessageSchema.safeParse(parsed);
      if (!result.success) return;

      const message = result.data;
      if (message.type === "joined") {
        setSelfActorId(message.actorId);
      } else if (message.type === "memberList") {
        setMembers(message.members);
      } else if (message.type === "history") {
        // join 직후 한 번, SQLite에 영속화된 이전 대화 전체를 재생해준다(새로고침해도 유지).
        setEntries(message.entries);
      } else {
        setEntries((prev) => [...prev, message.entry]);
      }
    });

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [url]);

  const sendAction = useCallback((action: ClientAction) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(clientActionSchema.parse(action)));
    }
  }, []);

  const join = useCallback(
    (nick: string, characterId: string) => sendAction({ type: "join", nick, characterId }),
    [sendAction],
  );
  const say = useCallback(
    (text: string, mode: SpeechMode = "say", targetActorId?: string) =>
      sendAction({ type: "say", text, mode, targetActorId }),
    [sendAction],
  );

  return { status, members, entries, selfActorId, join, say };
}
