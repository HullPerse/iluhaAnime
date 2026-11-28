import { writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

const entries: unknown[] = [];
const query = `query($page:Int!){Page(page:$page,perPage:50){characters(sort:FAVOURITES_DESC){id favourites name{full native alternative} image{large} media(type:ANIME,sort:POPULARITY_DESC,perPage:10){nodes{id type isAdult title{romaji english native} synonyms popularity status startDate{year month day}}}}}}`;

for (let page = 1; page <= 16; page++) {
  const response = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { page } }),
  });

  if (!response.ok) throw new Error(`AniList HTTP ${response.status}`);
  const payload = (await response.json()) as {
    data?: {
      Page: {
        characters: {
          id: number;
          favourites: number;
          name: { full: string; native: string | null; alternative: string[] };
          image: { large: string };
          media: {
            nodes: {
              id: number;
              type: string;
              isAdult: boolean;
              title: { romaji: string; english: string | null; native: string | null };
              synonyms: string[];
              popularity: number;
              status: string;
              startDate: { year: number | null; month: number | null; day: number | null };
            }[];
          };
        }[];
      };
    };
  };

  if (!payload.data) throw new Error("AniList returned no data");

  for (const c of payload.data.Page.characters) {
    const anime = c.media.nodes.find(
      (m) => m.type === "ANIME" && !m.isAdult && ["FINISHED", "RELEASING"].includes(m.status)
    );

    if (!anime || !c.image.large || !c.name.full) continue;
    entries.push({
      id: c.id,
      name: c.name.full,
      aliases: [c.name.native, ...c.name.alternative].filter(Boolean),
      image: c.image.large,
      animeId: anime.id,
      anime: anime.title.romaji,
      animeType: "ANIME",
      animeAnswers: c.media.nodes
        .filter(
          (m) => m.type === "ANIME" && !m.isAdult && ["FINISHED", "RELEASING"].includes(m.status)
        )
        .map((m) => ({
          id: m.id,
          name: m.title.romaji,
          aliases: [m.title.english, m.title.native, ...m.synonyms].filter((s): s is string =>
            Boolean(s)
          ),
        })),
      tier: entries.length < 120 ? "easy" : entries.length < 400 ? "medium" : "hard",
    });
  }

  console.log(`Page ${page}: ${entries.length} anime characters`);
  await delay(2100);
}

if (entries.length < 500) throw new Error("Character pool too small");
await writeFile(
  "src-tauri/data/daily-characters-v1.json",
  `${JSON.stringify({ version: 1, entries }, null, 2)}\n`
);
