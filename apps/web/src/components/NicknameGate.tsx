import { useEffect, useState } from "react";
import { avatarAssetUrl } from "../assets";
import type { AssetCatalogState } from "../useAssetCatalog";
import type { ConnectionStatus } from "../useRoomConnection";

interface NicknameGateProps {
  status: ConnectionStatus;
  catalogState: AssetCatalogState;
  onSubmit: (nick: string, characterId: string) => void;
}

export function NicknameGate({ status, catalogState, onSubmit }: NicknameGateProps) {
  const [nick, setNick] = useState("");
  const [characterId, setCharacterId] = useState<string | null>(null);

  const avatars = catalogState.status === "ready" ? catalogState.catalog.avatars : [];

  // 카탈로그 로드가 끝나면 첫 캐릭터를 기본 선택으로 잡는다.
  useEffect(() => {
    if (characterId === null && avatars.length > 0) {
      setCharacterId(avatars[0]!.characterId);
    }
  }, [avatars, characterId]);

  const canSubmit = status === "open" && catalogState.status === "ready" && nick.trim().length > 0 && characterId !== null;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = nick.trim();
        if (trimmed && characterId) onSubmit(trimmed, characterId);
      }}
    >
      <h1>Comic Chat</h1>
      <input value={nick} onChange={(e) => setNick(e.target.value)} placeholder="닉네임을 입력하세요" autoFocus />

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
