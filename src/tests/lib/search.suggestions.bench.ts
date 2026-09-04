import { bench, describe } from "vitest";

import {
  fuzzyMatchScore,
  getSearchSuggestions,
  normalizeSearchText,
} from "@/lib/search.suggestions";
import type { SearchAnimeSuggestion } from "@/types/search";

function makeAnimeIndex(count: number): SearchAnimeSuggestion[] {
  const statuses = ["COMPLETED", "CURRENT", "PLANNING", "FAVOURITE", "DROPPED", "PAUSED"] as const;
  const titles = [
    "Frieren: Beyond Journey's End",
    "Attack on Titan",
    "Steins;Gate",
    "Fullmetal Alchemist: Brotherhood",
    "Sousou no Frieren",
    "Boku no Hero Academia",
    "Kimetsu no Yaiba",
    "Jujutsu Kaisen",
    "One Piece",
    "Naruto Shippuden",
    "Жёсткий тест",
    "Магия и меч",
    "Токийский гуль",
  ];
  const aliases = [
    ["Sousou no Frieren"],
    ["Shingeki no Kyojin"],
    [],
    ["Hagane no Renkinjutsushi"],
    [],
    ["My Hero Academia"],
    ["Demon Slayer"],
    [],
    [],
    [],
    [],
    [],
    [],
  ];
  const out: SearchAnimeSuggestion[] = [];
  for (let i = 0; i < count; i++) {
    const base = i % titles.length;
    out.push({
      id: i,
      title: `${titles[base]} ${i}`,
      aliases: aliases[base] ?? [],
      status: statuses[i % statuses.length]!,
      score: (i % 10) * 10,
      favourite: i % 7 === 0,
      season: null,
      seasonYear: null,
    });
  }
  return out;
}

const animeIndex2k = makeAnimeIndex(2000);
const history = ["frieren 1080p", "frieren bd", "attack on titan s02", "жесткий тест", "магия меч"];

describe("search bench 2k", () => {
  bench("normalizeSearchText 1k", () => {
    for (let i = 0; i < 1000; i++) normalizeSearchText("  Friéren_S02 café ЖЁсткий  ");
  });

  bench("fuzzyMatchScore exact", () => {
    for (let i = 0; i < 2000; i++) fuzzyMatchScore("frieren", "Frieren: Beyond Journey's End");
  });

  bench("fuzzyMatchScore typo", () => {
    for (let i = 0; i < 500; i++) fuzzyMatchScore("friren", "Frieren");
  });

  bench("getSearchSuggestions 2k anime + history", () => {
    getSearchSuggestions("frieren", {
      animeIndex: animeIndex2k,
      history,
      limit: 8,
    });
  });

  bench("getSearchSuggestions cyrillic ё", () => {
    getSearchSuggestions("жесткий", {
      animeIndex: animeIndex2k,
      history,
      limit: 8,
    });
  });
});
