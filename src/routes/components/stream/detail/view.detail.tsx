import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Copy, Info } from "lucide-react";

import Modal from "@/components/shared/modal.component";
import { useI18n } from "@/hooks/i18n.hook";
import { reportBackgroundError } from "@/lib/core/attempt.utils";
import { buildStreamLink } from "@/lib/core/deeplink.utils";
import type { StreamHistoryEntry, StreamingAnime, StreamingEpisode } from "@/types/player/stream";
import type { useStreamTitle } from "@/hooks/stream/catalog.hook";

import StreamEpisodes from "@/routes/components/stream/episodes.stream";
import StreamHero from "@/routes/components/stream/hero.stream";
import { StreamError } from "@/routes/components/stream/states/error.states";
import { StreamInlineLoading } from "@/routes/components/stream/states/inlineLoading.states";
import { HeaderAction } from "@/routes/components/stream/detail/headerAction.detail";

export function StreamDetailView({
  anime,
  episode,
  episodes,
  onClose,
  onOpenAnilist,
  onPick,
  playingId,
  previews,
  history,
  slug,
  signedIn,
  title,
}: {
  anime: StreamingAnime | undefined;
  episode: StreamingEpisode | null;
  episodes: StreamingEpisode[] | undefined;
  onClose: () => void;
  onOpenAnilist: () => void;
  onPick: (episode: StreamingEpisode) => void;
  playingId: string | null;
  previews: Map<number, string>;
  history: ReadonlyMap<string, StreamHistoryEntry>;
  slug: string;
  signedIn: boolean;
  title: ReturnType<typeof useStreamTitle>;
}) {
  const { t } = useI18n();
  const copyLink = () => {
    writeText(buildStreamLink(anime?.slugUrl ?? slug)).catch((error: unknown) =>
      reportBackgroundError("stream.copy-link", error)
    );
  };
  return (
    <Modal
      header={anime?.title ?? t("stream.detail.loading")}
      onClose={onClose}
      className="w-208 max-w-[94%]"
      headerActions={
        <>
          {anime?.anilistId && signedIn ? (
            <HeaderAction
              title={t("stream.anilist.open")}
              onClick={onOpenAnilist}
              icon={<Info className="size-2.5" />}
            />
          ) : null}
          <HeaderAction
            title={t("stream.link.copy")}
            onClick={copyLink}
            icon={<Copy className="size-2.5" />}
          />
        </>
      }
    >
      {title.isPending ? (
        <div className="windows95-border bg-primary flex h-40 items-center justify-center">
          <StreamInlineLoading />
        </div>
      ) : title.error || !anime ? (
        <StreamError
          title={t("stream.error.details")}
          detail={title.error?.message}
          onRetry={() => title.refetch()}
        />
      ) : (
        <div className="flex w-full min-w-0 flex-col gap-2">
          <StreamHero anime={anime} />

          <StreamEpisodes
            episodes={episodes ?? []}
            isPending={title.isPending}
            error={title.error}
            selectedId={playingId ?? episode?.id ?? null}
            previews={previews}
            history={history}
            onPick={onPick}
            onRetry={() => title.refetch()}
          />
        </div>
      )}
    </Modal>
  );
}
