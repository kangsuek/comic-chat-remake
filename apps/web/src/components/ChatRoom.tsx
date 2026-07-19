import { foldEvents, type SayEvent, type SpeechMode } from "@comic-chat/comic-engine";
import type { HistoryEntry } from "@comic-chat/protocol";
import { useMemo, useState } from "react";
import { avatarAssetUrl } from "../assets";
import type { AssetCatalogState } from "../useAssetCatalog";
import { useLocalEmotionPreview } from "../useLocalEmotionPreview";
import { useOptimisticSay } from "../useOptimisticSay";
import type { ChangeNickRejectReason, RoomConnection } from "../useRoomConnection";
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

const CHANGE_NICK_ERROR_MESSAGE: Record<ChangeNickRejectReason, string> = {
  nickTaken: "이미 사용 중인 닉네임입니다.",
  invalidNick: "닉네임을 입력해주세요.",
};

export function ChatRoom({ nick, connection, catalogState }: ChatRoomProps) {
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<SpeechMode>("say");
  const [whisperTarget, setWhisperTarget] = useState("");
  const [nickDraft, setNickDraft] = useState("");
  // 서버 왕복 없이 타이핑 즉시 반응하는 로컬 감정 미리보기(원작 ChatPreSendText의 재현).
  const preview = useLocalEmotionPreview(draft);

  const avatarIconUrl = (characterId: string): string | null => {
    if (catalogState.status !== "ready") return null;
    const avatar = catalogState.catalog.avatars.find((a) => a.characterId === characterId);
    return avatar?.icon ? avatarAssetUrl(characterId, avatar.icon.imagePath) : null;
  };

  // 메시지 전송 즉시 로컬에서 감정/포즈를 계산해 "잠정" historyEntry를 끝에 이어붙인다(낙관적
  // 미리보기, Phase 4 3단계). 서버가 확정 결과를 브로드캐스트하면 자동으로 잠정 항목이 빠지고
  // connection.entries의 진짜 항목으로 교체된다(useOptimisticSay 내부 reconcile).
  const { entries: optimisticEntries, say: optimisticSay } = useOptimisticSay(
    connection,
    catalogState.status === "ready" ? catalogState.catalog : null,
  );

  // 클라이언트도 서버(Room)와 동일한 foldEvents()를 그대로 돌려 패널 구조를 재구성한다
  // (plan.md: 서버/클라가 같은 워크스페이스 링크로 동일 로직을 공유 — 이원화 방지).
  const fold = useMemo(() => foldEvents(optimisticEntries.map(toSayEvent)), [optimisticEntries]);
  const actorNicks = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of optimisticEntries) map.set(entry.actorId, entry.nick);
    return map;
  }, [optimisticEntries]);

  const whisperCandidates = connection.members.filter((m) => m.actorId !== connection.selfActorId);
  const canSubmit = draft.trim().length > 0 && (mode !== "whisper" || whisperTarget !== "");

  return (
    <div>
      <aside>
        <h2>참여자 ({connection.members.length})</h2>
        <ul>
          {connection.members.map((m) => {
            const iconUrl = avatarIconUrl(m.characterId);
            return (
              <li key={m.actorId}>
                {iconUrl && <img src={iconUrl} alt="" width={20} height={20} />}
                {m.nick}
                {m.actorId === connection.selfActorId && " (나)"}
              </li>
            );
          })}
        </ul>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = nickDraft.trim();
            if (!trimmed) return;
            connection.changeNick(trimmed);
            setNickDraft("");
          }}
        >
          <input value={nickDraft} onChange={(e) => setNickDraft(e.target.value)} placeholder="새 닉네임" />
          <button type="submit" disabled={nickDraft.trim().length === 0}>
            닉네임 변경
          </button>
          {connection.changeNickError && <p role="alert">{CHANGE_NICK_ERROR_MESSAGE[connection.changeNickError]}</p>}
        </form>
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
            optimisticSay(trimmed, mode, mode === "whisper" ? whisperTarget : undefined);
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
