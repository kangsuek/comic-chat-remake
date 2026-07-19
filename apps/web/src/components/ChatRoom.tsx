import { foldEvents, type SayEvent, type SpeechMode } from "@comic-chat/comic-engine";
import type { HistoryEntry } from "@comic-chat/protocol";
import { useMemo, useState } from "react";
import type { AssetCatalogState } from "../useAssetCatalog";
import { useLocalEmotionPreview } from "../useLocalEmotionPreview";
import type { RoomConnection } from "../useRoomConnection";
import { PanelCanvas } from "./PanelCanvas";

interface ChatRoomProps {
  nick: string;
  connection: RoomConnection;
  catalogState: AssetCatalogState;
}

function toSayEvent(entry: HistoryEntry): SayEvent {
  return { actorId: entry.actorId, characterId: entry.characterId, mode: entry.mode, text: entry.text, pose: entry.pose };
}

// shout은 원작에서 별도 말풍선 스타일이 없다(panel.cpp의 MakeBalloon이 SM_SHOUT 분기를
// 구현하지 않음 — SpeechBubble.tsx 주석 참고) — 텍스트를 대문자로 치면 AllCaps 규칙이 알아서
// SHOUT 감정을 인식해 표정으로 드러나므로, 이 선택지에는 넣지 않는다.
const MODE_OPTIONS: { value: SpeechMode; label: string }[] = [
  { value: "say", label: "말하기" },
  { value: "think", label: "생각하기" },
  { value: "whisper", label: "귓속말" },
  { value: "action", label: "액션" },
];

export function ChatRoom({ nick, connection, catalogState }: ChatRoomProps) {
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<SpeechMode>("say");
  const [whisperTarget, setWhisperTarget] = useState("");
  // 서버 왕복 없이 타이핑 즉시 반응하는 로컬 감정 미리보기(원작 ChatPreSendText의 재현).
  const preview = useLocalEmotionPreview(draft);

  // 클라이언트도 서버(Room)와 동일한 foldEvents()를 그대로 돌려 패널 구조를 재구성한다
  // (plan.md: 서버/클라가 같은 워크스페이스 링크로 동일 로직을 공유 — 이원화 방지).
  const fold = useMemo(() => foldEvents(connection.entries.map(toSayEvent)), [connection.entries]);
  const actorNicks = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of connection.entries) map.set(entry.actorId, entry.nick);
    return map;
  }, [connection.entries]);

  const whisperCandidates = connection.members.filter((m) => m.actorId !== connection.selfActorId);
  const canSubmit = draft.trim().length > 0 && (mode !== "whisper" || whisperTarget !== "");

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
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {fold.panels.map((panel, i) =>
            catalogState.status === "ready" ? (
              <PanelCanvas key={i} panel={panel} actorNicks={actorNicks} catalog={catalogState.catalog} />
            ) : (
              <p key={i}>{panel.balloons.map((b) => `${actorNicks.get(b.speakerActorId) ?? "?"}: ${b.text}`).join(" / ")}</p>
            ),
          )}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = draft.trim();
            if (!trimmed || !canSubmit) return;
            connection.say(trimmed, mode, mode === "whisper" ? whisperTarget : undefined);
            setDraft("");
          }}
        >
          <select value={mode} onChange={(e) => setMode(e.target.value as SpeechMode)}>
            {MODE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {mode === "whisper" && (
            <select value={whisperTarget} onChange={(e) => setWhisperTarget(e.target.value)}>
              <option value="">대상 선택...</option>
              {whisperCandidates.map((m) => (
                <option key={m.actorId} value={m.actorId}>
                  {m.nick}
                </option>
              ))}
            </select>
          )}
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`${nick}로 말하기...`}
          />
          <button type="submit" disabled={!canSubmit}>
            보내기
          </button>
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
