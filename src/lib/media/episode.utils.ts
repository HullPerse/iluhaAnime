import type { EpisodeHit, MediaClassifiedToken, PartHit, SeasonHit } from "@/types/media";

function emptyConsumed(): Set<number> {
  return new Set<number>();
}

export function extractSeason(tokens: MediaClassifiedToken[]): SeasonHit {
  const consumed = emptyConsumed();
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens.at(index);
    if (!token) continue;
    const atom = atomSeason(token, index, consumed);
    if (atom) return atom;
  }
  return { season: 0, consumed };
}

function atomSeason(
  token: MediaClassifiedToken,
  index: number,
  consumed: Set<number>
): SeasonHit | null {
  const short = /^s(\d+)$/i.exec(token.value);
  if (token.kind === "seasonEpisode") {
    const match = /^s(\d{1,2})e\d{1,3}$/i.exec(token.value);
    if (match?.[1]) {
      consumed.add(index);
      return { season: Number.parseInt(match[1], 10), consumed };
    }
    return null;
  }
  if (token.kind === "season" && short?.[1]) {
    consumed.add(index);
    return { season: Number.parseInt(short[1], 10), consumed };
  }
  const ordinal = /^(\d+)(?:st|nd|rd|th)$/i.exec(token.value);
  if (token.kind === "season" && ordinal?.[1]) {
    consumed.add(index);
    return { season: Number.parseInt(ordinal[1], 10), consumed };
  }
  return null;
}

export function extractTvSeason(
  tokens: MediaClassifiedToken[],
  consumed: Set<number>
): SeasonHit | null {
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens.at(index);
    const next = tokens.at(index + 1);
    if (token?.kind === "season" && !/^\d/.test(token.value) && !/^s\d+$/i.test(token.value)) {
      if (next && next.kind === "episode" && /^\d{1,2}$/.test(next.value)) {
        consumed.add(index);
        consumed.add(index + 1);
        return { season: Number.parseInt(next.value, 10), consumed };
      }
    }
    if (
      token?.kind === "type" &&
      token.value.toLowerCase() === "tv" &&
      next &&
      /^\d{1,2}$/.test(next.value)
    ) {
      const season = Number.parseInt(next.value, 10);
      consumed.add(index);
      consumed.add(index + 1);
      return { season, variant: `TV-${season}`, consumed };
    }
  }
  return null;
}

export function extractPart(tokens: MediaClassifiedToken[]): PartHit {
  const consumed = emptyConsumed();
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens.at(index);
    if (token?.kind !== "part") continue;
    const digits = /\d+/.exec(token.value);
    if (digits) {
      consumed.add(index);
      return { part: Number.parseInt(digits[0], 10), consumed };
    }
    const next = tokens.at(index + 1);
    if (next && next.kind === "episode" && /^\d{1,2}$/.test(next.value)) {
      consumed.add(index);
      consumed.add(index + 1);
      return { part: Number.parseInt(next.value, 10), consumed };
    }
  }
  return { consumed };
}

function findAtomEpisode(tokens: MediaClassifiedToken[], consumed: Set<number>): EpisodeHit | null {
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens.at(index);
    if (token?.kind !== "seasonEpisode") continue;
    const match = /^s\d{1,2}e(\d{1,3})$/i.exec(token.value);
    if (match?.[1]) {
      consumed.add(index);
      return {
        number: Number.parseInt(match[1], 10),
        atomIndex: index,
        fallbackIndex: -1,
        consumed,
      };
    }
  }
  return null;
}

function findShortEpisode(
  tokens: MediaClassifiedToken[],
  consumed: Set<number>
): EpisodeHit | null {
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens.at(index);
    if (token?.kind === "episode" && /^e\d+$/i.test(token.value)) {
      consumed.add(index);
      return {
        number: Number.parseInt(token.value.slice(1), 10),
        atomIndex: -1,
        fallbackIndex: -1,
        consumed,
      };
    }
  }
  return null;
}

function findBracketEpisode(
  tokens: MediaClassifiedToken[],
  consumed: Set<number>
): EpisodeHit | null {
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens.at(index);
    if (!token || token.kind !== "episode" || token.enclosed === "plain") continue;
    if (/^\d{1,3}$/.test(token.value)) {
      consumed.add(index);
      return {
        number: Number.parseInt(token.value, 10),
        atomIndex: -1,
        fallbackIndex: -1,
        consumed,
      };
    }
    const ofTotal = /(\d{1,3})_of_(\d{1,3})/i.exec(token.value);
    if (ofTotal?.[1] && ofTotal[2]) {
      consumed.add(index);
      return {
        number: Number.parseInt(ofTotal[1], 10),
        ofTotal: Number.parseInt(ofTotal[2], 10),
        atomIndex: -1,
        fallbackIndex: -1,
        consumed,
      };
    }
    const range = /^(\d{1,3})-(\d{1,3})$/.exec(token.value);
    if (range?.[1] && range[2]) {
      consumed.add(index);
      return {
        number: Number.parseInt(range[1], 10),
        numberAlt: Number.parseInt(range[2], 10),
        atomIndex: -1,
        fallbackIndex: -1,
        consumed,
      };
    }
  }
  return null;
}

function findFallbackEpisode(
  tokens: MediaClassifiedToken[],
  consumed: Set<number>
): EpisodeHit | null {
  let last = -1;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens.at(index);
    if (token?.kind === "episode" && /^\d{1,3}$/.test(token.value)) last = index;
  }
  if (last < 0) return null;
  return { number: undefined, atomIndex: -1, fallbackIndex: last, consumed };
}

export function extractEpisode(tokens: MediaClassifiedToken[]): EpisodeHit {
  const consumed = emptyConsumed();
  return (
    findAtomEpisode(tokens, consumed) ??
    findShortEpisode(tokens, consumed) ??
    findBracketEpisode(tokens, consumed) ??
    findFallbackEpisode(tokens, consumed) ?? {
      number: undefined,
      atomIndex: -1,
      fallbackIndex: -1,
      consumed,
    }
  );
}
