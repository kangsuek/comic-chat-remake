import { ChatRoom } from "./components/ChatRoom";
import { NicknameGate } from "./components/NicknameGate";
import { useAssetCatalog } from "./useAssetCatalog";
import { useRoomConnection } from "./useRoomConnection";

const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:8080";

export default function App() {
  const connection = useRoomConnection(WS_URL);
  const catalogState = useAssetCatalog();

  // 서버가 "joined"로 확정해주기 전까지는 입장 화면에 머문다 — join이 거부(닉네임 중복 등)될
  // 수도 있으므로, 원작의 TryNewNick처럼 재시도할 기회를 준다(NicknameGate가 joinError 표시).
  if (connection.selfActorId === null) {
    return (
      <NicknameGate
        status={connection.status}
        catalogState={catalogState}
        joinError={connection.joinError}
        onSubmit={(chosenNick, characterId) => connection.join(chosenNick, characterId)}
      />
    );
  }

  // 내 닉네임은 로컬 state로 따로 들고 있지 않고 memberList에서 매번 조회한다 — changeNick으로
  // 바뀌어도 별도 동기화 없이 항상 최신 값을 보여준다.
  const myNick = connection.members.find((m) => m.actorId === connection.selfActorId)?.nick ?? "";
  return <ChatRoom nick={myNick} connection={connection} catalogState={catalogState} />;
}
