import { ListVideo } from "lucide-react";

import Image from "@/components/ui/image.component";
import { useI18n } from "@/hooks/i18n.hook";
import { useStreamCover } from "@/hooks/remoteImage.hook";
import { enterOrSpace } from "@/lib/ui/keyboard.utils";
import type { StreamingEpisode } from "@/types/player/stream";

export default function EpisodeRow({
  episode,
  current,
  cover,
  fallbackCover,
  onPick,
}: {
  episode: StreamingEpisode;
  current: boolean;
  cover: string | null;
  fallbackCover: string | null;
  onPick: (episode: StreamingEpisode) => void;
}) {
  const { t } = useI18n();
  const art = useStreamCover(cover);
  const fallback = useStreamCover(art ? null : fallbackCover);
  const image = art ?? fallback;
  const label = episode.title
    ? `${episode.number}. ${episode.title}`
    : t("player.stream.episodes.number", { n: episode.number });

  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={current ? "true" : undefined}
      onClick={() => onPick(episode)}
      onKeyDown={enterOrSpace(() => onPick(episode))}
      title={label}
      className={`windows95-border mb-1 flex cursor-pointer items-center gap-1 p-1 select-none ${
        current ? "windows95-active-border bg-secondary text-primary" : "bg-field hover:bg-surface"
      }`}
    >
      <div className="windows95-border bg-field relative flex h-10 w-18 shrink-0 items-center justify-center overflow-hidden">
        {image ? (
          <Image src={image} alt={label} className="h-full w-full" type="cover" loading="lazy" />
        ) : (
          <ListVideo className="text-hint size-3" aria-hidden />
        )}
      </div>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={`windows95-font truncate text-xs ${current ? "font-bold" : ""}`}>
          {label}
        </span>
        <span className="text-hint text-xs tabular-nums">
          {episode.duration ? t("player.stream.episodes.duration", { n: episode.duration }) : ""}
        </span>
      </span>
    </div>
  );
}
