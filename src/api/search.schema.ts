import * as z from "zod/mini";

const SearchResultSchema = z.looseObject({
  title: z.string(),
  magnet: z.string(),
  torrent: z.string(),
  size: z.string(),
  seeders: z.number(),
  leechers: z.number(),
  category: z.string(),
  link: z.string(),
});

export const SearchResultListSchema = z.compile(z.array(SearchResultSchema));
