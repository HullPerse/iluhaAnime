import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Copy, Info } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { streamApi } from "@/api/stream.api";
import Modal from "@/components/shared/modal.component";
import { useAnilistSignedIn } from "@/hooks/anilist/session.hook";
import { useI18n } from "@/hooks/i18n.hook";
import {
  useAnilistEpisodePreviews,
  useStreamHistoryForAnime,
  useStreamTitle,
} from "@/hooks/stream/catalog.hook";
import { loadWatch, openStream, prewarmPlayer } from "@/lib/playback.utils";
import { RESUME_END_MARGIN, RESUME_MIN } from "@/lib/resume.utils";
import { buildWatchKey } from "@/lib/streamHelpers.utils";
import { historyByEpisode, isEpisodeWatched } from "@/lib/history.utils";
import { emptyPrefs, pickVariant, withQuality, withVariant } from "@/lib/streamPrefs.utils";
import { pickSource, toVariantSources } from "@/lib/sources.utils";
import { attempt, reportBackgroundError } from "@/lib/attempt.utils";
import { buildStreamLink } from "@/lib/deeplink.utils";
import { inflightFetch } from "@/lib/lruCache.utils";
import { ignore } from "@/lib/promise.utils";
import { addNotification } from "@/store/notification.store";
import { settingsAtoms } from "@/store/settings.store";
import { streamStore } from "@/store/stream.store";
import type { TFunc } from "@/types/i18n";
import type {
  StreamHistoryEntry,
  StreamPrefs,
  StreamVariant,
  StreamingAnime,
  StreamingEpisode,
} from "@/types/stream";
import type { AnimeLibAnime, StreamSource } from "@/types/videoPlayer";

import AniListDetailModal from "../anilist/detail/modal.detail";
import StreamEpisodes from "./episodes.stream";
import StreamHero from "./hero.stream";
import { StreamError, StreamInlineLoading } from "./states.stream";

/** Fixed identity of the only shipped source. */
const SOURCE_ID = "animelib";
const SOURCE_NAME = "AnimeLib";

interface Playable {
  variant: StreamVariant;
  source: StreamSource;
  sources: StreamSource[];
  variants: StreamVariant[];
}

// The rows and the sources behind one click are asked for twice around it: by
// the warm-up that runs when the title opens and by the click itself. Going
// through these maps makes the second call join the first request instead of
// repeating it; an entry is dropped as soon as its request settles, so a later
// click reaches the Rust client's own short-lived cache.
const playersInflight = new Map<string, Promise<StreamVariant[]>>();
const sourcesInflight = new Map<string, Promise<StreamSource[]>>();

function loadPlayers(episodeId: string): Promise<StreamVariant[]> {
  return inflightFetch(playersInflight, episodeId, () => streamApi.players(episodeId));
}

function loadSources(episodeId: string, variantId: string): Promise<StreamSource[]> {
  return inflightFetch(sourcesInflight, `${episodeId}:${variantId}`, () =>
    streamApi.streamSources({ episodeId, variantId })
  );
}

/** A watched episode restarts; anything else resumes where it stopped. */
function startPosition(watchKey: string, restart: boolean): Promise<number | undefined> {
  return restart ? Promise.resolve(undefined) : resumePosition(watchKey);
}

/**
 * Turn the remembered voice-over and quality into a concrete media URL. The
 * preference read, the player rows and the resume position do not depend on
 * each other and go out together. A failure carries the provider's own words
 * when it sent any.
 */
async function resolvePlayable(
  mediaId: string,
  episodeId: string,
  watchKey: string,
  restart: boolean
): Promise<
  | { playable: Playable; prefs: StreamPrefs | null; resume: number | undefined }
  | { failure: string }
> {
  const [prefsResult, resume] = await Promise.all([
    attempt(streamApi.prefsGet(SOURCE_ID, mediaId)),
    // A watched episode starts over: the cached position is at the end, and
    // resuming it would replay the last seconds.
    startPosition(watchKey, restart),
  ]);
  const prefs = prefsResult[0] ?? null;
  // The remembered voice-over is what will play, and asking for its sources
  // does not need the row list. Resolving both at once drops a whole network
  // leg from the click-to-play path; a stale remembered id falls back to the
  // row request below, which costs what it used to.
  const remembered = prefs?.variantId ?? null;
  const [rowsResult, rememberedSources] = await Promise.all([
    attempt(loadPlayers(episodeId)),
    remembered ? attempt(loadSources(episodeId, remembered)) : null,
  ]);
  const [rows, rowsFailure] = rowsResult;
  const variant = rows ? pickVariant(rows, prefs) : null;
  if (rowsFailure || !variant) {
    return { failure: rowsFailure?.message ?? "" };
  }
  const variantId = `${variant.player}:${variant.id}`;
  const [sources, sourcesFailure] =
    remembered === variantId && rememberedSources
      ? rememberedSources
      : await attempt(loadSources(episodeId, variantId));
  // A title without a remembered quality starts at the configured default;
  // pickSource degrades to the nearest lower quality when it is missing.
  const quality = prefs?.quality || settingsAtoms.streamDefaultQuality.get();
  const source = sources ? pickSource(sources, quality) : null;
  if (sourcesFailure || !sources || !source) {
    return { failure: sourcesFailure?.message ?? "" };
  }
  return { playable: { variant, source, sources, variants: rows }, prefs, resume };
}

/**
 * Warm what a click on `episodeId` waits for: the episode's voice-over rows and
 * the sources of the remembered voice-over. The title modal knows both long
 * before the click, and the Rust client keeps the answers for a few minutes, so
 * the click reads them instead of the network. A failure is dropped: the click
 * asks again and reports it itself.
 */
async function prefetchEpisode(mediaId: string, episodeId: string): Promise<void> {
  const [prefs] = await attempt(streamApi.prefsGet(SOURCE_ID, mediaId));
  const remembered = prefs?.variantId ?? null;
  await Promise.all([
    attempt(loadPlayers(episodeId)),
    remembered ? attempt(loadSources(episodeId, remembered)) : null,
  ]);
}

/** The position to resume from, unless the last session reached the end. */
async function resumePosition(watchKey: string): Promise<number | undefined> {
  const [watch] = await attempt(loadWatch(watchKey));
  if (!watch || watch.position < RESUME_MIN) return undefined;
  const finished = watch.duration > 0 && watch.position >= watch.duration - RESUME_END_MARGIN;
  return finished ? undefined : watch.position;
}

async function playEpisode(
  anime: AnimeLibAnime | undefined,
  target: StreamingEpisode,
  playingId: string | null,
  setPlayingId: (id: string | null) => void,
  t: TFunc,
  entry?: StreamHistoryEntry
): Promise<void> {
  if (!anime || playingId) return;
  setPlayingId(target.id);
  // Resume from the stream watch key, not from the URL, so a rotated CDN link
  // does not lose the position. A position at the very end starts over.
  const watchKey = buildWatchKey(SOURCE_ID, anime.id, target.id);
  const resolved = await resolvePlayable(anime.id, target.id, watchKey, isEpisodeWatched(entry));
  if (!("playable" in resolved)) {
    addNotification(
      t("stream.playFailed"),
      "error",
      resolved.failure || t("stream.error.noSources")
    );
    setPlayingId(null);
    return;
  }
  const { variant, source, sources, variants } = resolved.playable;
  const { prefs, resume } = resolved;

  const base = prefs ?? emptyPrefs(SOURCE_ID, anime.id);
  const remembered = withQuality(withVariant(base, variant), source.label);
  const [, prefsFailure] = await attempt(streamApi.prefsSave(remembered));
  if (prefsFailure) {
    // Playback still proceeds: a failed preference write must not cost the
    // episode, it only means the next one starts from the fallback.
    addNotification(t("stream.playFailed"), "error", prefsFailure.message);
  }

  const [, openFailure] = await attempt(
    openStream({
      sourceId: SOURCE_ID,
      sourceName: SOURCE_NAME,
      mediaId: anime.id,
      mediaTitle: anime.title,
      slug: anime.slugUrl,
      episodeId: target.id,
      episodeNumber: target.number,
      episodeTitle: target.title ?? "",
      cover: anime.cover,
      anilistId: anime.anilistId ?? null,
      watchKey,
      resume,
      // A stream opens paused: the user asked for the episode, not for it to
      // start playing while the player window is still coming up.
      paused: true,
      headers: source.headers,
      proxyUrl: settingsAtoms.animelibProxyUrl.get(),
      quality: source.label,
      variantId: source.variantId,
      sources: toVariantSources(sources),
      variants,
      mediaUrl: source.url,
    })
  );
  if (openFailure) addNotification(t("stream.playFailed"), "error", openFailure.message);
  setPlayingId(null);
}

function useStreamEpisodeSelection(
  episodes: StreamingEpisode[] | undefined,
  preferredId: string | null
) {
  const [episode, setEpisode] = useState<StreamingEpisode | null>(null);
  useEffect(() => {
    if (episode) return;
    // The remembered episode wins over the first one, but the history query
    // can answer after the season: the hook waits for it instead of locking
    // onto episode one.
    const preferred =
      preferredId === null
        ? undefined
        : episodes?.find((candidate) => candidate.id === preferredId);
    const first = preferred ?? episodes?.[0];
    if (first) setEpisode(first);
  }, [episode, episodes, preferredId]);
  return [episode, setEpisode] as const;
}

/** The small square button the modal header carries next to its close. */
function HeaderAction({
  title,
  onClick,
  icon,
}: {
  title: string;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="windows95-active-border bg-primary text-text windows95-text flex size-5 cursor-pointer items-center justify-center hover:brightness-110 active:translate-x-px active:translate-y-px"
    >
      {icon}
    </button>
  );
}

function StreamDetailView({
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
  /** The catalog slug the modal is open for, so the shared link is stable. */
  slug: string;
  signedIn: boolean;
  title: ReturnType<typeof useStreamTitle>;
}) {
  const { t } = useI18n();
  // A copy is its own confirmation: the button is the feedback, so it raises
  // no notification either on success or on failure.
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

/**
 * The title modal. It lists episodes and nothing else: a click plays the
 * episode straight away with the remembered voice-over and quality, and every
 * further choice (voice-over, quality, audio, subtitles) lives in the player's
 * source panel, where the current position is already known.
 */
export default function StreamDetail({ slug }: { slug: string }) {
  const { t } = useI18n();
  const title = useStreamTitle(slug);
  const anime = title.data?.anime;
  const episodes = title.data?.episodes;
  // Per-episode preview art only exists on AniList, and only for titles it
  // matched; a missing map simply means the rows show no popup.
  const previews = useAnilistEpisodePreviews(anime?.anilistId);
  const signedIn = useAnilistSignedIn();
  const historyQuery = useStreamHistoryForAnime(anime?.id ?? null);
  const history = useMemo(() => historyByEpisode(historyQuery.data ?? []), [historyQuery.data]);
  // The newest remembered row is where "continue" points: the modal opens on
  // that episode instead of episode one.
  const latestEpisodeId = useMemo(() => {
    let latest: StreamHistoryEntry | null = null;
    for (const row of historyQuery.data ?? []) {
      if (!latest || row.updatedAt > latest.updatedAt) latest = row;
    }
    return latest?.episodeId ?? null;
  }, [historyQuery.data]);
  const [anilistOpen, setAnilistOpen] = useState(false);
  const [episode, setEpisode] = useStreamEpisodeSelection(episodes, latestEpisodeId);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const close = () => streamStore.selectedSlug.set(null);

  // The player window is normally warm from app start, but a user who closed
  // the player left none behind. Opening a title is the earliest reliable sign
  // that an episode is about to be clicked, so rebuild it here rather than on
  // the click itself. A failure costs nothing: the open command creates it.
  useEffect(() => {
    ignore(attempt(prewarmPlayer()).then(() => undefined));
  }, []);

  // The neighbours of the current episode are warmed, not just the first one:
  // the player's "after this episode" setting and the Next button both jump to
  // the next row, and that jump should not wait for two network legs.
  const animeId = anime?.id ?? null;
  const episodeIndex = useMemo(() => {
    if (!episodes || episodes.length === 0) return -1;
    const index = episode ? episodes.findIndex((candidate) => candidate.id === episode.id) : 0;
    return index === -1 ? 0 : index;
  }, [episode, episodes]);
  const neighbourIds = useMemo(() => {
    if (!episodes) return [];
    return [episodes[episodeIndex - 1], episodes[episodeIndex + 1]]
      .filter((candidate): candidate is StreamingEpisode => candidate !== undefined)
      .map((candidate) => candidate.id);
  }, [episodeIndex, episodes]);
  useEffect(() => {
    if (!animeId) return;
    for (const neighbourId of neighbourIds) ignore(prefetchEpisode(animeId, neighbourId));
  }, [animeId, neighbourIds]);

  const play = (target: StreamingEpisode): Promise<void> =>
    playEpisode(anime, target, playingId, setPlayingId, t, history.get(target.id));

  // The AniList details replace this modal instead of stacking on top of it:
  // one dialog at a time, and Back returns to the episode list.
  if (anilistOpen && anime?.anilistId) {
    return (
      <AniListDetailModal
        animeId={anime.anilistId}
        isLoggedIn={signedIn}
        onTag={() => undefined}
        onGenre={() => undefined}
        onBack={() => setAnilistOpen(false)}
        onClose={close}
      />
    );
  }

  return (
    <StreamDetailView
      anime={anime}
      episode={episode}
      episodes={episodes}
      onClose={close}
      onOpenAnilist={() => setAnilistOpen(true)}
      onPick={(picked) => {
        setEpisode(picked);
        ignore(play(picked));
      }}
      playingId={playingId}
      previews={previews}
      history={history}
      slug={slug}
      signedIn={signedIn}
      title={title}
    />
  );
}
