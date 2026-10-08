import { SEARCH_RANKING } from "@/config/search/ranking.config";

const MAX_QUERY_LENGTH = SEARCH_RANKING.MAX_QUERY_LENGTH;

export function foldDiacritics(value: string): string {
  return value
    .normalize("NFKD")
    .replaceAll(/\p{Mark}/gu, "")
    .toLocaleLowerCase();
}

export function normalizeSearchText(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replaceAll(/\p{Mark}/gu, "")
      .toLowerCase()
      .match(/[\p{Letter}\p{Number}]+/gu)
      ?.join(" ")
      .slice(0, MAX_QUERY_LENGTH) ?? ""
  );
}
