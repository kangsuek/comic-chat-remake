import { useState } from "react";
import { useLocalEmotionPreview } from "../useLocalEmotionPreview";
import type { RoomConnection } from "../useRoomConnection";

interface ChatRoomProps {
  nick: string;
  connection: RoomConnection;
}

export function ChatRoom({ nick, connection }: ChatRoomProps) {
  const [draft, setDraft] = useState("");
  // 서버 왕복 없이 타이핑 즉시 반응하는 로컬 감정 미리보기(원작 ChatPreSendText의 재현).
  const preview = useLocalEmotionPreview(draft);

  return (
    <div>
      <aside>
        <h2>참여자 ({connection.members.length})</h2>
        <ul>
          {connection.members.map((m) => (
            <li key={m.actorId}>{m.nick}</li>
          ))}
        </ul>
      </aside>
      <main>
        <ul>
          {connection.entries.map((entry, i) => (
            <li key={`${entry.actorId}-${entry.ts}-${i}`}>
              <strong>{entry.nick}:</strong> {entry.text}
              {entry.emotion && (
                <span>
                  {" "}
                  [{entry.emotion.emotion}({entry.emotion.priority})]
                </span>
              )}
            </li>
          ))}
        </ul>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = draft.trim();
            if (trimmed) {
              connection.say(trimmed);
              setDraft("");
            }
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`${nick}로 말하기...`}
          />
          <button type="submit">보내기</button>
          {preview && (
            <span>
              {" "}
              미리보기: {preview.emotion}({preview.priority})
            </span>
          )}
        </form>
      </main>
    </div>
  );
}
