import { bench, group } from "@pmndrs/labs";

import {
  formatMeanScore,
  normalizeToTen,
  parseScoreFormat,
  scoreFormatMax,
} from "../../src/lib/anilist/anilistScore.utils";
import type { AnilistScoreFormat } from "../../src/types/anilist/anilistScore";

const FORMATS: AnilistScoreFormat[] = ["POINT_100", "POINT_10_DECIMAL", "POINT_10", "POINT_5", "POINT_3"];

group("anilist score @anilist @quick", () => {
  bench("normalizeToTen x10k", () => {
    let sum = 0;
    for (let index = 0; index < 10000; index++) {
      const format = FORMATS[index % FORMATS.length];
      const v = normalizeToTen((index % 101) as number, format);
      if (v != null) sum += v;
    }
    return sum;
  });

  bench("formatMeanScore x10k", () => {
    let sum = 0;
    for (let index = 0; index < 10000; index++) {
      const format = FORMATS[index % FORMATS.length];
      const s = formatMeanScore(78.4 + (index % 22), format);
      if (s != null) sum += s.length;
    }
    return sum;
  });

  bench("parseScoreFormat x10k", () => {
    let sum = 0;
    for (let index = 0; index < 10000; index++) {
      const f = parseScoreFormat(`POINT_${index % 5 === 0 ? "10" : "100"}`);
      sum += scoreFormatMax(f);
    }
    return sum;
  });
});
