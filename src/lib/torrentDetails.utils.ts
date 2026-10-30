import type { Source } from "@/types/search";
import type { Anime, TorrentDetails, TorrentView } from "@/types/torrent";

function nonEmpty(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback;
}

export function buildTorrentView(
  details: TorrentDetails,
  item: Anime,
  magnets: Record<string, string>,
  source: Source
): TorrentView {
  const shellTitle = source === "nekobt" && /^(home|neko\s*bt)$/i.test(details.title);
  return {
    ...details,
    title: shellTitle ? item.title : nonEmpty(details.title, item.title),
    description: details.description?.trim() ?? "",
    category: nonEmpty(details.category, item.category),
    size: nonEmpty(details.size, item.size),
    seeders: details.seeders || item.seeders,
    leechers: details.leechers || item.leechers,
    magnet: nonEmpty(details.magnet, magnets[item.link] || item.magnet),
    torrentUrl: nonEmpty(details.torrentUrl, item.torrent),
    fields: Array.isArray(details.fields) ? details.fields : [],
    files: Array.isArray(details.files) ? details.files : [],
    screenshots: Array.isArray(details.screenshots) ? details.screenshots : [],
    comments: Array.isArray(details.comments) ? details.comments : [],
  };
}
