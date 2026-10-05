import ConnectLobby from "./components/lobby/connect.lobby";
import RoomLobby from "./components/lobby/room.lobby";

import { useSessionStatus } from "@/hooks/session/queries.hook";

export default function LobbyRoute() {
  const { data, isPending } = useSessionStatus();

  if (data?.role) return <RoomLobby status={data} />;
  return <ConnectLobby loading={isPending} />;
}
