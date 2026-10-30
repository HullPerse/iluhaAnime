import { fileNameFromPath, parseMediaPath } from "@/lib/parse.utils";
import type { AniUser } from "@/types/anilist";
import type { DiscordActivity, DiscordButton, DiscordPresenceDetail } from "@/types/discord";
import type { TFunc } from "@/types/i18n";
import type { StreamOpen } from "@/types/videoPlayer";
import type { PlayerPresenceInput } from "@/types/presence";

const ANILIST_ORIGIN = "https://anilist.co";
const MAX_TEXT_CHARS = 128;
const MAX_BUTTON_LABEL_CHARS = 32;
const MAX_URL_CHARS = 512;
const WATCHING_TYPE = 3;

export const PRESENCE_PROGRESS_INTERVAL_MS = 15_000;

interface PlayerCard {
  details: string;
  state?: string;
  buttonLabel: string;
  buttonUrl: string;
}

export function anilistAnimeUrl(id: number): string {
  return `${ANILIST_ORIGIN}/anime/${id}`;
}

export function anilistSearchUrl(title: string): string {
  return `${ANILIST_ORIGIN}/search/anime?search=${encodeURIComponent(title)}`;
}

export function anilistProfileUrl(name: string): string {
  return `${ANILIST_ORIGIN}/user/${encodeURIComponent(name)}`;
}

export function presenceText(value: string, limit = MAX_TEXT_CHARS): string {
  const collapsed = value.replaceAll(/\s+/gu, " ").trim();
  const characters = Array.from(collapsed);
  if (characters.length <= limit) return collapsed;
  if (limit <= 3) return characters.slice(0, Math.max(0, limit)).join("");
  return `${characters.slice(0, limit - 3).join("")}...`;
}

export function buildIdleActivity(
  user: Pick<AniUser, "name" | "anime_count"> | null,
  t: TFunc
): DiscordActivity {
  if (!user) return { details: t("discord.idle.running") };
  const profile = presenceButton(t("discord.button.profile"), anilistProfileUrl(user.name));
  return compactActivity({
    details: t("discord.idle.library", {
      titles: user.anime_count,
    }),
    buttons: profile ? [profile] : undefined,
  });
}

export function buildDetailActivity(detail: DiscordPresenceDetail, t: TFunc): DiscordActivity {
  const button = presenceButton(t("discord.button.anilist"), anilistAnimeUrl(detail.id));
  return compactActivity({
    details: presenceText(detail.title),
    state: t("discord.detail.state"),
    buttons: button ? [button] : undefined,
  });
}

export function buildSearchActivity(t: TFunc): DiscordActivity {
  return { details: t("discord.search.details") };
}

export function buildPlayerActivity(
  input: PlayerPresenceInput,
  t: TFunc,
  now = Date.now()
): DiscordActivity | null {
  const card = input.stream ? streamCard(input.stream, t) : localCard(input, t);
  if (!card) return null;

  const state = playerState(card.state, input, t);
  const timestamps = playerTimestamps(input, now);
  const button = presenceButton(card.buttonLabel, card.buttonUrl);

  return compactActivity({
    details: card.details,
    state,
    startTimestamp: timestamps?.start,
    endTimestamp: timestamps?.end,
    activityType: WATCHING_TYPE,
    buttons: button ? [button] : undefined,
  });
}

export function samePresence(
  previous: DiscordActivity | null,
  next: DiscordActivity | null
): boolean {
  if (previous === next) return true;
  if (!previous || !next) return false;
  if (
    previous.details !== next.details ||
    previous.state !== next.state ||
    previous.startTimestamp !== next.startTimestamp ||
    previous.endTimestamp !== next.endTimestamp ||
    previous.activityType !== next.activityType
  ) {
    return false;
  }
  const previousButtons = previous.buttons ?? [];
  const nextButtons = next.buttons ?? [];
  return (
    previousButtons.length === nextButtons.length &&
    previousButtons.every(
      (button, index) =>
        button.label === nextButtons[index].label && button.url === nextButtons[index].url
    )
  );
}

function localCard(input: PlayerPresenceInput, t: TFunc): PlayerCard | null {
  if (!input.hasFile || !input.path) return null;
  if (!input.parseTitles) {
    const name = fileNameFromPath(input.path);
    return {
      details: presenceText(name),
      buttonLabel: t("discord.button.search"),
      buttonUrl: anilistSearchUrl(stripExtension(name)),
    };
  }
  const parsed = parseMediaPath(input.path);
  const details = parsed.arc ? `${parsed.title}: ${parsed.arc}` : parsed.title;
  const parts: string[] = [];
  if (parsed.season) parts.push(t("player.title.season", { n: parsed.season }));
  const episode = parsed.episode.number ?? parsed.episode.numberAlt;
  if (episode !== undefined) {
    parts.push(
      parsed.episode.title
        ? t("player.title.episode.colon", { title: parsed.episode.title })
        : t("player.title.episode", { n: episode })
    );
  } else if (parsed.episode.title) {
    parts.push(t("player.title.episode.colon", { title: parsed.episode.title }));
  }
  return {
    details: presenceText(details),
    state: parts.length > 0 ? parts.join(", ") : undefined,
    buttonLabel: t("discord.button.search"),
    buttonUrl: anilistSearchUrl(parsed.searchTitle || parsed.title),
  };
}

function streamCard(stream: StreamOpen, t: TFunc): PlayerCard {
  const episodeTitle = stream.episodeTitle.trim();
  return {
    details: presenceText(stream.mediaTitle),
    state: episodeTitle
      ? t("player.title.episode.colon", { title: episodeTitle })
      : t("player.title.episode", { n: stream.episodeNumber }),
    buttonLabel: stream.anilistId ? t("discord.button.anilist") : t("discord.button.search"),
    buttonUrl: stream.anilistId
      ? anilistAnimeUrl(stream.anilistId)
      : anilistSearchUrl(stream.mediaTitle),
  };
}

function playerState(
  episode: string | undefined,
  input: PlayerPresenceInput,
  t: TFunc
): string | undefined {
  if (!input.paused) return episode;
  const paused = t("discord.player.paused");
  return episode ? `${episode} - ${paused}` : paused;
}

function playerTimestamps(
  input: PlayerPresenceInput,
  now: number
): { start: number; end: number } | null {
  if (input.paused || input.eofReached || !input.hasFile) return null;
  if (!Number.isFinite(input.duration) || input.duration <= 0) return null;
  const position = Math.min(Math.max(0, input.timePos), input.duration);
  const start = now - Math.round(position * 1000);
  const end = start + Math.round(input.duration * 1000);
  return end > start ? { start, end } : null;
}

function presenceButton(label: string, url: string): DiscordButton | null {
  const safe = safeUrl(url);
  if (!safe) return null;
  return { label: presenceText(label, MAX_BUTTON_LABEL_CHARS), url: safe };
}

function safeUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_URL_CHARS) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function compactActivity(activity: DiscordActivity): DiscordActivity {
  const next: DiscordActivity = {};
  if (activity.details) next.details = activity.details;
  if (activity.state) next.state = activity.state;
  if (activity.startTimestamp !== undefined) next.startTimestamp = activity.startTimestamp;
  if (activity.endTimestamp !== undefined) next.endTimestamp = activity.endTimestamp;
  if (activity.activityType !== undefined) next.activityType = activity.activityType;
  if (activity.buttons && activity.buttons.length > 0) next.buttons = activity.buttons;
  return next;
}

function stripExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}
