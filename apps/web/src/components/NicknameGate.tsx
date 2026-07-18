import { useState } from "react";
import type { ConnectionStatus } from "../useRoomConnection";

interface NicknameGateProps {
  status: ConnectionStatus;
  onSubmit: (nick: string) => void;
}

export function NicknameGate({ status, onSubmit }: NicknameGateProps) {
  const [nick, setNick] = useState("");
  const canSubmit = status === "open" && nick.trim().length > 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = nick.trim();
        if (trimmed) onSubmit(trimmed);
      }}
    >
      <h1>Comic Chat</h1>
      <input
        value={nick}
        onChange={(e) => setNick(e.target.value)}
        placeholder="닉네임을 입력하세요"
        autoFocus
      />
      <button type="submit" disabled={!canSubmit}>
        {status === "open" ? "입장" : "서버에 연결 중..."}
      </button>
    </form>
  );
}
