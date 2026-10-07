/* eslint-disable no-console, no-void, no-lone-blocks */
// Highlight module regression benchmarks (post-replacement: new pipeline only).
// Historical old-vs-new numbers live in .docs/DECISIONS.md.
// Run: bun scripts/bench-highlight.ts
import {
  findSubsequenceRanges,
  mergeRanges,
  normalizeText,
  splitByRanges,
} from "../src/lib/highlight/highlight.utils";

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

function stats(times: number[]) {
  const sorted = [...times].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function fmt(ms: number) {
  return ms < 1 ? `${(ms * 1000).toFixed(0)}us` : `${ms.toFixed(2)}ms`;
}

// B1: single-pass normalize with memo
{
  const N = 10_000;
  const ct: number[] = [];
  for (let round = 0; round < 5; round++) {
    const t0 = performance.now();
    for (let i = 0; i < N; i++) void normalizeText(LONG);
    ct.push(performance.now() - t0);
  }
  console.log(`B1 normalize long-string x${N}: ${fmt(stats(ct))}`);
}

// B2: find+split across corpus shapes
{
  for (const [label, corpus] of [
    ["short", SHORT],
    ["long", [LONG]],
    ["accented", [ACCENTED]],
  ] as const) {
    const N = corpus === SHORT ? 20_000 : 500;
    const ct: number[] = [];
    for (let round = 0; round < 5; round++) {
      const t0 = performance.now();
      for (let i = 0; i < N; i++) {
        for (const [v, q] of corpus.map(
          (text, k) => [text, QUERIES[k % QUERIES.length]] as const
        )) {
          void splitByRanges(v, findSubsequenceRanges(v, q));
        }
      }
      ct.push(performance.now() - t0);
    }
    console.log(`B2 find+split ${label} x${N * corpus.length}: ${fmt(stats(ct))}`);
  }
}

// B3: merge with overlaps and kind priority
{
  const N = 10_000;
  const ranges = [
    { start: 0, end: 30, kind: "match" as const },
    { start: 10, end: 20, kind: "spell-error" as const },
    { start: 25, end: 60, kind: "spell-warn" as const },
    { start: 55, end: 58, kind: "match" as const },
  ];
  const value = "x".repeat(100);
  const ct: number[] = [];
  for (let round = 0; round < 5; round++) {
    const t0 = performance.now();
    for (let i = 0; i < N; i++) void splitByRanges(value, mergeRanges(ranges, value.length));
    ct.push(performance.now() - t0);
  }
  console.log(`B3 merge x${N}: ${fmt(stats(ct))}`);
  console.log(
    `  tokens: ${JSON.stringify(splitByRanges(value, mergeRanges(ranges, value.length)).map((t) => [t.text.length, t.highlighted, t.kind]))}`
  );
}

// B6: did-you-mean diff matcher
{
  const N = 20_000;
  const pairs: Array<[string, string]> = [
    ["Naruto Shippuden", "naruto shipuden"],
    ["Sousou no Frieren", "sosu no friren"],
    ["One Piece", "one peace"],
  ];
  const ct: number[] = [];
  for (let round = 0; round < 5; round++) {
    const t0 = performance.now();
    for (let i = 0; i < N; i++) {
      for (const [correction, query] of pairs) {
        void splitByRanges(correction, findSubsequenceRanges(correction, query));
      }
    }
    ct.push(performance.now() - t0);
  }
  console.log(`B6 did-you-mean diff x${N * pairs.length}: ${fmt(stats(ct))}`);
}
