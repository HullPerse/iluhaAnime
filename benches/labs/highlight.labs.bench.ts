import { bench, group } from "@pmndrs/labs";

import {
  findSubsequenceRanges,
  mergeRanges,
  normalizeText,
  splitByRanges,
} from "@hullperse/hp_utils/highlight";

const SHORT = [
  "Naruto",
  "One Piece",
  "Sword Art Online",
  "Boku no Hero Academia",
  "[Erai-raws] Naruto - 01 [1080p].mkv",
];
const QUERIES = ["nrt", "one", "sao", "bnha", "nrt01"];
const LONG =
  "/downloads/anime/[Erai-raws] Sousou no Frieren - 28 [1080p][Multiple Subtitle].mkv ".repeat(20);
const ACCENTED = "Pokémon Café Résumé naïve Zoë ".repeat(20);

function checksumTokens(text: string, query: string): number {
  const tokens = splitByRanges(text, findSubsequenceRanges(text, query));
  let sum = tokens.length;

  for (const token of tokens) sum += token.text.length + (token.highlighted ? 1 : 0);

  return sum;
}

group("highlight @highlight @quick", () => {
  bench("normalize long-string x10k", () => {
    let sum = 0;

    for (let i = 0; i < 10_000; i++) sum += normalizeText(LONG).length;

    return sum;
  });

  bench("find+split short corpus", () => {
    let sum = 0;

    for (let i = 0; i < 20_000; i++) {
      for (let k = 0; k < SHORT.length; k++)
        sum += checksumTokens(SHORT[k], QUERIES[k % QUERIES.length]);
    }

    return sum;
  });

  bench("find+split long string x500", () => {
    let sum = 0;

    for (let i = 0; i < 500; i++) sum += checksumTokens(LONG, "frieren");

    return sum;
  });

  bench("find+split accented x500", () => {
    let sum = 0;

    for (let i = 0; i < 500; i++) sum += checksumTokens(ACCENTED, "resume");

    return sum;
  });

  bench("merge overlapping ranges x10k", () => {
    const ranges = [
      { start: 0, end: 30, kind: "match" as const },
      { start: 10, end: 20, kind: "spell-error" as const },
      { start: 25, end: 60, kind: "spell-warn" as const },
      { start: 55, end: 58, kind: "match" as const },
    ];
    const value = "x".repeat(100);
    let sum = 0;

    for (let i = 0; i < 10_000; i++) {
      const tokens = splitByRanges(value, mergeRanges(ranges, value.length));
      sum += tokens.length;
    }

    return sum;
  });

  bench("did-you-mean diff pairs", () => {
    const pairs: Array<[string, string]> = [
      ["Naruto Shippuden", "naruto shipuden"],
      ["Sousou no Frieren", "sosu no friren"],
      ["One Piece", "one peace"],
    ];
    let sum = 0;

    for (let i = 0; i < 20_000; i++) {
      for (const [correction, query] of pairs) sum += checksumTokens(correction, query);
    }

    return sum;
  });
});
