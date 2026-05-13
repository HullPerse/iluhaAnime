import { Button } from "@/components/ui/button.component";
import { LobbyStateInfo, VideoStreamInfo } from "@/types";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  UserRoundX,
} from "lucide-react";
import { useEffect, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import Player from "./player.component";
import Users from "./lobby/users.lobby";
import PlaylistLobby from "./lobby/playlist.lobby";

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

  const [chapters, setChapters] = useState<
    { start_time: number; end_time: number; title: string }[]
  >([]);

  const [streams, setStreams] = useState<VideoStreamInfo[]>([]);

  useEffect(() => {
    if (!video) {
      setChapters([]);
      setStreams([]);
      return;
    }

    invoke<{ start_time: number; end_time: number; title: string }[]>(
      "get_video_chapters",
      { path: video.path },
    )
      .then((chs) => setChapters(chs))
      .catch(() => setChapters([]));

    Promise.all([
      invoke<VideoStreamInfo[]>("get_video_streams", { path: video.path }),
      invoke<VideoStreamInfo[]>("scan_external_tracks", { path: video.path }),
    ])
      .then(([embedded, external]) => setStreams([...embedded, ...external]))
      .catch(() => setStreams([]));
  }, [video]);

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
      playlist: (
        <PlaylistLobby
          activePath={video?.path}
          onPlay={(entry) =>
            setVideo({
              path: entry.path,
              file: entry.name,
            })
          }
        />
      ),
      settings: <>2</>,
    };

    return tabMap[tab as keyof typeof tabMap];
  };

  return (
    <main className="flex flex-row h-full w-full justify-between">
      <section className="flex flex-col flex-1">
        <Player
          header={video ? video?.file : "Ожидается видео"}
          src={video ? convertFileSrc(video.path) : undefined}
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
          chapters={chapters}
          mediaPath={video?.path}
          streams={streams}
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
