import { describe, expect, it } from "vitest";

import { clearMediaParseCache, parseMediaFile } from "@/lib/media/parse.utils";
import type { MediaFileParse } from "@/types/media";

import expectedRows from "./expected.json";
import fixtureRows from "./fixtures.json";

type Fixture = { id: string; dir: string; file: string };
const fixtures = fixtureRows as Fixture[];
const expected = expectedRows as Record<string, unknown>[];
const byId = new Map(expected.map((entry) => [entry.id as string, entry]));

const EPISODE_PICKERS: Record<string, (parsed: MediaFileParse) => unknown> = {
  e: (parsed) => parsed.episode.number,
  ea: (parsed) => parsed.episode.numberAlt,
  et: (parsed) => parsed.episode.title,
  eOf: (parsed) => parsed.episode.ofTotal,
};

const FIELD_PICKERS: Record<string, (parsed: MediaFileParse) => unknown> = {
  t: (parsed) => parsed.title,
  st: (parsed) => parsed.searchTitle,
  s: (parsed) => parsed.season,
  p: (parsed) => parsed.part,
  y: (parsed) => parsed.year,
  k: (parsed) => parsed.kind,
  g: (parsed) => parsed.groups,
  lang: (parsed) => parsed.lang,
  codec: (parsed) => parsed.codec,
  src: (parsed) => parsed.source,
  service: (parsed) => parsed.service,
  audio: (parsed) => parsed.audio,
  audioLang: (parsed) => parsed.audioLang,
  subs: (parsed) => parsed.subs,
  subVariant: (parsed) => parsed.subVariant,
  res: (parsed) => parsed.resolution,
  depth: (parsed) => parsed.depth,
  crc: (parsed) => parsed.crc,
  sequel: (parsed) => parsed.sequel,
  arc: (parsed) => parsed.arc,
  variant: (parsed) => parsed.variant,
  special: (parsed) => parsed.special,
  tag: (parsed) => parsed.tags,
  dub: (parsed) => parsed.dub,
  type: (parsed) => parsed.type,
};

function pickField(parsed: MediaFileParse, key: string): unknown {
  const episodePicker = EPISODE_PICKERS[key];
  if (episodePicker) return episodePicker(parsed);
  return FIELD_PICKERS[key]?.(parsed);
}

function pickSidecar(parsed: MediaFileParse, key: string): unknown {
  const sidecar = parsed.sidecar as unknown as Record<string, unknown> | undefined;
  return sidecar?.[key];
}

describe("parseMediaFile corpus fixtures", () => {
  for (const fixture of fixtures) {
    it(`${fixture.id} parses ${fixture.file}`, () => {
      const wanted = byId.get(fixture.id);
      expect(wanted, `missing expected row for ${fixture.id}`).toBeDefined();
      const parsed = parseMediaFile(fixture.dir, fixture.file);
      for (const [key, value] of Object.entries(wanted ?? {})) {
        if (key === "id" || key === "x" || key === "sidecar") continue;
        expect(pickField(parsed, key), `${fixture.id}.${key}`).toEqual(value ?? undefined);
      }
      const sidecar = (wanted as Record<string, unknown>)?.sidecar as
        | Record<string, unknown>
        | undefined;
      if (sidecar) {
        for (const [key, value] of Object.entries(sidecar)) {
          expect(pickSidecar(parsed, key), `${fixture.id}.sidecar.${key}`).toEqual(value);
        }
      }
    });
  }

  it("caches repeated parses", () => {
    clearMediaParseCache();
    const first = parseMediaFile("Anime/Horimiya", "Horimiya - 01.mkv");
    const second = parseMediaFile("Anime/Horimiya", "Horimiya - 01.mkv");
    expect(second).toBe(first);
    clearMediaParseCache();
  });
});
