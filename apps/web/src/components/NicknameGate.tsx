import { useEffect, useState } from "react";
import type { RoomSummary } from "@comic-chat/protocol";
import { avatarAssetUrl } from "../assets";
import type { AssetCatalogState } from "../useAssetCatalog";
import type { ConnectionStatus, JoinRejectReason } from "../useRoomConnection";

interface NicknameGateProps {
  status: ConnectionStatus;
  catalogState: AssetCatalogState;
  /** join이 거부됐다면 그 이유 — irc.cpp의 TryNewNick처럼 사유를 안내하고 재입력을 유도한다. */
  joinError: JoinRejectReason | null;
  /** 지금 사람이 있는 방 목록(irc.cpp의 LIST 포팅) — 클릭하면 방 이름 입력창을 채운다. */
  rooms: RoomSummary[];
  onRequestRoomList: () => void;
  onSubmit: (nick: string, characterId: string, roomId: string) => void;
}

const JOIN_ERROR_MESSAGE: Record<JoinRejectReason, string> = {
  nickTaken: "이미 사용 중인 닉네임입니다. 다른 닉네임을 입력해주세요.",
  invalidCharacter: "선택한 캐릭터를 찾을 수 없습니다. 다시 선택해주세요.",
};

const DEFAULT_ROOM_ID = "lobby";

export function NicknameGate({ status, catalogState, joinError, rooms, onRequestRoomList, onSubmit }: NicknameGateProps) {
  const [nick, setNick] = useState("");
  const [characterId, setCharacterId] = useState<string | null>(null);
  const [roomId, setRoomId] = useState(DEFAULT_ROOM_ID);

  const avatars = catalogState.status === "ready" ? catalogState.catalog.avatars : [];

  // 카탈로그 로드가 끝나면 첫 캐릭터를 기본 선택으로 잡는다.
  useEffect(() => {
    if (characterId === null && avatars.length > 0) {
      setCharacterId(avatars[0]!.characterId);
    }
  }, [avatars, characterId]);

  // 연결되면 한 번, 지금 사람이 있는 방 목록을 요청한다(irc.cpp가 로그인 직후 방 목록을 보여주는
  // 것과 동일선상 — OnLogin/RequestedChannelList). 실시간 구독은 아니고 요청-응답 한 번뿐이라
  // 목록이 오래됐을 수 있으니 필요하면 status가 열려있는 동안 다시 호출해도 된다.
  useEffect(() => {
    if (status === "open") onRequestRoomList();
  }, [status, onRequestRoomList]);

  const canSubmit =
    status === "open" && catalogState.status === "ready" && nick.trim().length > 0 && characterId !== null && roomId.trim().length > 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const trimmedNick = nick.trim();
        const trimmedRoom = roomId.trim();
        if (trimmedNick && characterId && trimmedRoom) onSubmit(trimmedNick, characterId, trimmedRoom);
      }}
    >
      <h1>Comic Chat</h1>
      <input value={nick} onChange={(e) => setNick(e.target.value)} placeholder="닉네임을 입력하세요" autoFocus />
      {joinError && <p role="alert">{JOIN_ERROR_MESSAGE[joinError]}</p>}

      <div>
        <label>
          방 이름:{" "}
          <input value={roomId} onChange={(e) => setRoomId(e.target.value)} placeholder="lobby" />
        </label>
        {/* irc.cpp의 JOIN처럼 존재하지 않는 방 이름을 입력하면 그 방이 새로 만들어진다. */}
        {rooms.length > 0 && (
          <ul aria-label="현재 사람이 있는 방 목록">
            {rooms.map((r) => (
              <li key={r.roomId}>
                <button type="button" onClick={() => setRoomId(r.roomId)}>
                  {r.roomId} ({r.memberCount}명)
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {catalogState.status === "loading" && <p>캐릭터 목록을 불러오는 중...</p>}
      {catalogState.status === "error" && <p>캐릭터 목록을 불러오지 못했습니다: {catalogState.error}</p>}
      {catalogState.status === "ready" && (
        <div role="radiogroup" aria-label="캐릭터 선택">
          {avatars.map((avatar) => (
            <button
              key={avatar.characterId}
              type="button"
              aria-pressed={characterId === avatar.characterId}
              onClick={() => setCharacterId(avatar.characterId)}
              style={{
                border: characterId === avatar.characterId ? "2px solid #4a90d9" : "2px solid transparent",
              }}
            >
              {avatar.icon && <img src={avatarAssetUrl(avatar.characterId, avatar.icon.imagePath)} alt={avatar.name} width={40} height={40} />}
              <div>{avatar.name}</div>
            </button>
          ))}
        </div>
      )}

      <button type="submit" disabled={!canSubmit}>
        {status !== "open" ? "서버에 연결 중..." : catalogState.status !== "ready" ? "캐릭터 불러오는 중..." : "입장"}
      </button>
    </form>
  );
}
