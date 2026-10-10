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

const TV_WORD_RX = /^(tv|тв)$/i;
const COUNT_WORD_RX = /^(из|of)$/i;

export function isCountPair(tokens: MediaClassifiedToken[], digitIndex: number): boolean {
  const joiner = tokens.at(digitIndex + 1);
  const total = tokens.at(digitIndex + 2);
  return (
    !!joiner &&
    !!total &&
    COUNT_WORD_RX.test(joiner.value) &&
    total.kind === "episode" &&
    /^\d{1,3}$/.test(total.value)
  );
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
    // TV-season marker ("ТВ-2", "TV 2", Cyrillic included). A trailing
    // "N из M" count is not a season.
    if (
      token &&
      TV_WORD_RX.test(token.value) &&
      next &&
      /^\d{1,2}$/.test(next.value) &&
      (token.kind === "type" || next.kind === "episode") &&
      !isCountPair(tokens, index + 1)
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

function findVersionEpisode(
  tokens: MediaClassifiedToken[],
  consumed: Set<number>
): EpisodeHit | null {
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens.at(index);
    if (!token || consumed.has(index)) continue;
    if (!["episode", "unknown", "title"].includes(token.kind)) continue;
    if (token.enclosed !== "plain") continue;
    // Single-token version like "01v2"
    let versionMatch = /^(\d{1,3})v(\d+)$/i.exec(token.value);
    if (versionMatch) {
      consumed.add(index);
      return {
        number: Number.parseInt(versionMatch[1], 10),
        version: Number.parseInt(versionMatch[2], 10),
        atomIndex: -1,
        fallbackIndex: index,
        consumed,
      };
    }
    versionMatch = /^(\d{1,3})\s*\(v(\d+)\)$/i.exec(token.value);
    if (versionMatch) {
      consumed.add(index);
      return {
        number: Number.parseInt(versionMatch[1], 10),
        version: Number.parseInt(versionMatch[2], 10),
        atomIndex: -1,
        fallbackIndex: index,
        consumed,
      };
    }
    // Two-token version: "01" followed by "(v2)"
    if (/^\d{1,3}$/.test(token.value)) {
      const next = tokens.at(index + 1);
      if (next && (next.kind === "unknown" || next.kind === "title") && (next.enclosed === "plain" || next.enclosed === "paren")) {
        const versionMatch = /^\(v(\d+)\)$/i.exec(next.value) ?? /^v(\d+)$/i.exec(next.value);
        if (versionMatch) {
          consumed.add(index);
          consumed.add(index + 1);
          return {
            number: Number.parseInt(token.value, 10),
            version: Number.parseInt(versionMatch[1], 10),
            atomIndex: -1,
            fallbackIndex: index,
            consumed,
          };
        }
      }
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
    if (!token || token.kind !== "episode") continue;
    // Standalone range without brackets: "01-26", "01〜26".
    const soloRange = /^(\d{1,3})[-~～〜](\d{1,3})$/.exec(token.value);
    if (soloRange?.[1] && soloRange[2]) {
      consumed.add(index);
      return {
        number: Number.parseInt(soloRange[1], 10),
        numberAlt: Number.parseInt(soloRange[2], 10),
        atomIndex: -1,
        fallbackIndex: -1,
        consumed,
      };
    }
    if (token.enclosed === "plain") continue;
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
    const range = /^(\d{1,3})[-~～〜](\d{1,3})$/.exec(token.value);
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

// Tilde range across three tokens: "01 ~ 26" (also fullwidth "～" and
// wave dash "〜", both common in Asian batch releases). Consumes all three
// so neither the start nor the joiner leaks into the title.
const RANGE_JOINER_RX = /^[~～〜]$/;

function findTildeRange(
  tokens: MediaClassifiedToken[],
  consumed: Set<number>
): EpisodeHit | null {
  for (let index = 0; index < tokens.length - 2; index += 1) {
    const first = tokens.at(index);
    const joiner = tokens.at(index + 1);
    const last = tokens.at(index + 2);
    if (!first || !joiner || !last) continue;
    if (consumed.has(index) || consumed.has(index + 1) || consumed.has(index + 2)) continue;
    if (first.kind !== "episode" || !/^\d{1,3}$/.test(first.value)) continue;
    if (!RANGE_JOINER_RX.test(joiner.value)) continue;
    if (last.kind !== "episode" || !/^\d{1,3}$/.test(last.value)) continue;
    consumed.add(index);
    consumed.add(index + 1);
    consumed.add(index + 2);
    return {
      number: Number.parseInt(first.value, 10),
      numberAlt: Number.parseInt(last.value, 10),
      atomIndex: -1,
      fallbackIndex: -1,
      consumed,
    };
  }
  return null;
}

function findCountPair(
  tokens: MediaClassifiedToken[],
  consumed: Set<number>
): EpisodeHit | null {
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens.at(index);
    if (!token || token.kind !== "episode" || !/^\d{1,3}$/.test(token.value)) continue;
    if (consumed.has(index)) continue;
    if (!isCountPair(tokens, index)) continue;
    const total = tokens.at(index + 2);
    if (!total) continue;
    consumed.add(index);
    consumed.add(index + 1);
    consumed.add(index + 2);
    return {
      number: Number.parseInt(token.value, 10),
      ofTotal: Number.parseInt(total.value, 10),
      atomIndex: -1,
      fallbackIndex: -1,
      consumed,
    };
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
    findVersionEpisode(tokens, consumed) ??
    findBracketEpisode(tokens, consumed) ??
    findCountPair(tokens, consumed) ??
    findTildeRange(tokens, consumed) ??
    findFallbackEpisode(tokens, consumed) ?? {
      number: undefined,
      atomIndex: -1,
      fallbackIndex: -1,
      consumed,
    }
  );
}
