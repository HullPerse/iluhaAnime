import { Button } from "@/components/ui/button.component";
import { LobbyStateInfo } from "@/types";
import { ChevronLeft, ChevronRight, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import Player from "./player.component";

interface LobbyProps {
  state: LobbyStateInfo;
  onLeave: () => void;
  id: string;
}

function Lobby({ state, onLeave, id }: LobbyProps) {
  const [video, setVideo] = useState<{
    path: string;
    file: string;
  } | null>(null);

  const [menu, setMenu] = useState<boolean>(true);
  const [tab, currentTab] = useState<"users" | "playlist" | "settigns">(
    "users",
  );

  const translateTab = () => {
    const tabMap = {
      users: "Пользователи",
      playlist: "Плейлист",
      settings: "Параметры",
    };

    return tabMap[tab as keyof typeof tabMap];
  };

  return (
    <main className="flex flex-row h-full w-full justify-between">
      <section className="flex flex-col flex-1">
        <Player
          header={"video title"}
          src={undefined}
          onClose={() => setVideo(null)}
          special={
            !menu ? (
              <Button size="icon" className="size-4" onClick={() => {}}>
                <Eye />
              </Button>
            ) : (
              <></>
            )
          }
          // chapters={chapters}
          // mediaPath={
          //video.path
          // }
          // streams={streams}
        />
      </section>
      <section className="flex flex-col w-50 items-center windows95-active-border bg-primary">
        <div className="flex flex-row items-center justify-between bg-secondary w-full p-1">
          <span className="text-white windows95-text font-bold line-clamp-1">
            {translateTab()}
          </span>
          <div className="flex flex-row gap-1">
            <Button size="icon" className="size-5">
              <ChevronLeft />
            </Button>
            <Button size="icon" className="size-5">
              <ChevronRight />
            </Button>
            <Button size="icon" className="size-5">
              {menu ? <Eye /> : <EyeOff />}
            </Button>
          </div>
        </div>
      </section>
      {/*<section className="flex flex-col gap-2">
        <div className="windows95-text text-xs text-muted">
          {state.is_host ? "Хост" : "Подключён"} — {state.ip}:{state.port}
        </div>
        <div className="windows95-text">
          Пользователи ({state.users.length}):
        </div>
        <ul className="flex flex-col gap-0.5 list-disc list-inside">
          {state.users.map((u) => (
            <li key={u.id} className="flex items-center gap-1 text-sm">
              <span>{u.username || u.id}</span>
              {u.id === myId && (
                <span className="text-muted text-xs">(это вы)</span>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section className="flex flex-row gap-1 items-center justify-end mt-auto border-t-2 border-muted p-1 w-full">
        <Button onClick={onLeave}>Покинуть</Button>
      </section>*/}
    </main>
  );
}

export default Lobby;
