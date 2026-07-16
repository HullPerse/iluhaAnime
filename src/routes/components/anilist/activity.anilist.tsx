import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type { AniActivity } from "@/types/anilist";
import Modal from "@/components/shared/modal.component";
import {
  Loader,
  Play,
  Check,
  X,
  Bookmark,
  RotateCcw,
  Pause,
} from "lucide-react";
import ImageComponent from "@/components/ui/image.component";

const STATUS_ICONS: Record<string, typeof Play> = {
  CURRENT: Play,
  COMPLETED: Check,
  DROPPED: X,
  PLANNING: Bookmark,
  PAUSED: Pause,
  REPEATING: RotateCcw,
};

const STATUS_LABELS: Record<string, string> = {
  CURRENT: "начал(а) смотреть",
  COMPLETED: "посмотрел(а)",
  DROPPED: "бросил(а)",
  PLANNING: "запланировал(а)",
  PAUSED: "поставил(а) на паузу",
  REPEATING: "пересматривает",
};

function formatTime(unix: number): string {
  const now = Date.now() / 1000;
  const diff = now - unix;
  if (diff < 60) return "только что";
  if (diff < 3600) return `${Math.floor(diff / 60)} мин. назад`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч. назад`;
  return new Date(unix * 1000).toLocaleDateString("ru-RU");
}

function AniListActivityModal({
  userId,
  onClose,
  onAnimeClick,
}: {
  userId: number;
  onClose: () => void;
  onAnimeClick: (id: number) => void;
}) {
  const allIds = [userId];
  const { data, isLoading } = useQuery({
    queryKey: ["anilist_activity", ...allIds],
    queryFn: () =>
      invoke<AniActivity[]>("get_anilist_activity", { userIds: allIds }),
    enabled: allIds.length > 0,
  });

  return (
    <Modal header="Активность" onClose={onClose} className="w-2xl">
      {isLoading ? (
        <div className="flex items-center justify-center flex-1">
          <Loader className="size-6 animate-spin windows95-text" />
        </div>
      ) : !data?.length ? (
        <div className="flex items-center justify-center flex-1">
          <span className="windows95-text">Нет активности</span>
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          {data.map((a) => {
            const Icon = STATUS_ICONS[a.status ?? ""];
            return (
              <div
                key={a.id}
                className="relative flex flex-row items-start gap-2 px-1 py-1 windows95-active-border bg-primary"
              >
                {a.user_avatar ? (
                  <ImageComponent
                    src={a.user_avatar}
                    alt="user_avatar"
                    className="w-7 h-7 shrink-0 windows95-active-border"
                  />
                ) : (
                  <div className="w-7 h-7 shrink-0 windows95-active-border bg-white flex items-center justify-center text-[9px] font-bold">
                    {a.user_name[0]}
                  </div>
                )}
                <div className="flex flex-col min-w-0 flex-1">
                  {a.activity_type === "list" && a.media_id ? (
                    <section className="text-left">
                      <span className="text-[10px] windows95-text">
                        <span className="font-bold">{a.user_name}</span>{" "}
                        {Icon && <Icon className="size-2.5 inline" />}{" "}
                        {STATUS_LABELS[a.status ?? ""] ?? a.status}{" "}
                        <span
                          className="underline decoration-dotted hover:cursor-pointer"
                          onClick={() => onAnimeClick(a.media_id!)}
                        >
                          {a.media_title}
                        </span>
                      </span>
                      {a.progress && (
                        <span className="text-[9px] text-muted ml-1">
                          · {a.progress}
                        </span>
                      )}
                    </section>
                  ) : (
                    <span className="text-[10px] windows95-text">
                      <span className="font-bold">{a.user_name}</span> {a.text}
                    </span>
                  )}
                  <span className="absolute bottom-1 left-1 windows95-text text-muted">
                    {formatTime(a.created_at)}
                  </span>
                </div>
                {a.media_cover && (
                  <ImageComponent
                    src={a.media_cover}
                    alt="media_cover"
                    className="h-18 w-13 object-cover shrink-0 windows95-active-border hover:cursor-pointer"
                    onClick={() => onAnimeClick(a.media_id!)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

export default AniListActivityModal;
