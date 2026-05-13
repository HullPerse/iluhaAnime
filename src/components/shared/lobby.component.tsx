import { Button } from "@/components/ui/button.component";
import { LobbyStateInfo } from "@/types";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  UserRoundX,
} from "lucide-react";
import { useState } from "react";
import Player from "./player.component";
import Users from "./lobby/users.lobby";

const tabs = ["users", "playlist", "settings"];

function Lobby({
  state,
  onLeave,
  id,
}: {
  state: LobbyStateInfo;
  onLeave: () => void;
  id: string;
}) {
  const [video, setVideo] = useState<{
    path: string;
    file: string;
  } | null>(null);

  const [menu, setMenu] = useState<boolean>(true);
  const [tab, setTab] = useState<"users" | "playlist" | "settings">("users");

  const translateTab = () => {
    const tabMap = {
      users: "Пользователи",
      playlist: "Плейлист",
      settings: "Параметры",
    };

    return tabMap[tab as keyof typeof tabMap];
  };

  const tabComponent = () => {
    const tabMap = {
      users: <Users state={state} current={id} />,
      playlist: <>1</>,
      settings: <>2</>,
    };

    return tabMap[tab as keyof typeof tabMap];
  };

  return (
    <main className="flex flex-row h-full w-full justify-between">
      <section className="flex flex-col flex-1">
        <Player
          header={video ? video?.file : "Ожидается видео"}
          src={video?.file}
          onClose={() => setVideo(null)}
          special={
            !menu ? (
              <Button
                size="icon"
                className="size-4"
                onClick={() => setMenu(true)}
              >
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
      <section
        className="flex flex-col w-50 windows95-active-border bg-primary"
        hidden={!menu}
      >
        <div className="flex flex-row items-center justify-between bg-secondary w-full p-1">
          <span className="text-white windows95-text font-bold line-clamp-1">
            {translateTab()}
          </span>
          <div className="flex flex-row gap-1">
            <Button
              size="icon"
              className="size-5"
              onClick={() => {
                if (tab === "users") return;

                const currentIndex = tabs.indexOf(tab);
                const nextTab = tabs[currentIndex - 1];

                setTab(nextTab as "users" | "playlist" | "settings");
              }}
              disabled={tab === "users"}
            >
              <ChevronLeft />
            </Button>
            <Button
              size="icon"
              className="size-5"
              onClick={() => {
                if (tab === "settings") return;

                const currentIndex = tabs.indexOf(tab);
                const nextTab = tabs[currentIndex + 1];

                setTab(nextTab as "users" | "playlist" | "settings");
              }}
              disabled={tab === "settings"}
            >
              <ChevronRight />
            </Button>
            <Button
              size="icon"
              className="size-5"
              onClick={() => setMenu(!menu)}
            >
              {menu ? <Eye /> : <EyeOff />}
            </Button>
            <Button size="icon" className="size-5" onClick={onLeave}>
              <UserRoundX />
            </Button>
          </div>
        </div>
        {tabComponent()}

        <div className="mt-auto windows95-text text-xs text-muted">
          {state.is_host ? "Хост" : "Подключён"} — {state.ip}:{state.port}
        </div>
      </section>
    </main>
  );
}

export default Lobby;
