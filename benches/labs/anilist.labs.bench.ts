import { bench, group } from "@pmndrs/labs";
// AniList title resolution and score-format parsing over a synthetic
// catalog. Hot path: every search result, card, and notification resolves
// titles per render.
// Budget (avg/iter, Ryzen 7 5800X/node 26, 2026-10-08): resolve 68us,
// rotating 59us, fields 108us, score formats 481us. Regression threshold
// is labs minDelta 5%.

import {
  parseScoreFormat,
  scoreFormatMax,
  scoreFormatSuffix,
} from "../../src/lib/anilist/score.utils";
import {
  animeTitleFields,
  resolveAnimeTitle,
  type AnimeTitleFields,
} from "../../src/lib/anilist/title.utils";
import type { AniTitleLanguage } from "../../src/types/anilist";

const ROMAJI = ["Sousou no Frieren", "Naruto Shippuden", "One Piece", "Steins;Gate", "Re:Zero"];
const ENGLISH = ["Frieren", "Naruto Shippuden", "One Piece", "", "Re:Zero Starting Life"];
const NATIVE = ["葬送のフリーレン", "ナルト", "ワンピース", "シュタゲ", "リゼロ"];

function makeFields(count: number): AnimeTitleFields[] {
  const out: AnimeTitleFields[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      english: i % 5 === 3 ? null : `${ENGLISH[i % ENGLISH.length]} ${i}`,
      native: NATIVE[i % NATIVE.length],
      romaji: `${ROMAJI[i % ROMAJI.length]} ${i}`,
    });
  }
  return out;
}

const FIELDS_2K = makeFields(2000);
const PREFS: Array<AniTitleLanguage | null> = ["english", "romaji", "native", null];
const FORMAT_INPUTS = [
  "POINT_100",
  "point_10",
  "POINT_5",
  "bogus",
  "",
  "POINT_3",
  "POINT_10_DECIMAL",
];

group("anilist-titles @anilist @quick", () => {
  bench("resolve 2k titles x english pref", () => {
    let sum = 0;
    for (const fields of FIELDS_2K) sum += resolveAnimeTitle(fields, "english").length;
    return sum;
  });

  bench("resolve 2k titles x rotating prefs", () => {
    let sum = 0;
    for (let i = 0; i < FIELDS_2K.length; i++) {
      sum += resolveAnimeTitle(FIELDS_2K[i]!, PREFS[i % PREFS.length]!).length;
    }
    return sum;
  });

  bench("fields 2k from media rows", () => {
    let sum = 0;
    for (let i = 0; i < 2000; i++) {
      const fields = animeTitleFields({
        title: `fallback ${i}`,
        title_english: i % 5 === 3 ? null : `English ${i}`,
        title_native: `ネイティブ ${i}`,
        title_romaji: `Romaji ${i}`,
      });
      sum += fields.romaji.length + (fields.english?.length ?? 0);
    }
    return sum;
  });

  bench("parse score formats x10k", () => {
    let sum = 0;
    for (let i = 0; i < 10_000; i++) {
      const format = parseScoreFormat(FORMAT_INPUTS[i % FORMAT_INPUTS.length]);
      sum += scoreFormatMax(format) + scoreFormatSuffix(format).length;
    }
    return sum;
  });
});
