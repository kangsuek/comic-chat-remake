import { useState } from "react";
import { ChatRoom } from "./components/ChatRoom";
import { NicknameGate } from "./components/NicknameGate";
import { useRoomConnection } from "./useRoomConnection";

const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:8080";

export default function App() {
  const [nick, setNick] = useState<string | null>(null);
  const connection = useRoomConnection(WS_URL);

  if (!nick) {
    return (
      <NicknameGate
        status={connection.status}
        onSubmit={(chosenNick) => {
          setNick(chosenNick);
          connection.join(chosenNick);
        }}
      />
    );
  }

  return <ChatRoom nick={nick} connection={connection} />;
}
