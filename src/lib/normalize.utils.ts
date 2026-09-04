import { SEARCH_RANKING } from "@/config/searchRanking.config";

const MAX_QUERY_LENGTH = SEARCH_RANKING.MAX_QUERY_LENGTH;

export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replaceAll(/[\u0300-\u036F]/gu, "")
    .toLocaleLowerCase()
    .replaceAll(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .replaceAll(/\s+/gu, " ")
    .slice(0, MAX_QUERY_LENGTH);
}
