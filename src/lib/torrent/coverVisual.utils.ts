import type { CoverVisual } from "@/types/search/coverVisual";
import type { TorrentCoverState } from "@/types/search/searchCover";
import type { TorrentCoverMode } from "@/types/ui/settings";

export const coverVisual = (cover: TorrentCoverState, mode: TorrentCoverMode): CoverVisual => {
  if (mode === "off") return { mode: "hidden" };
  if (cover.status === "pending") return { mode: "waiting" };
  if (mode === "pages") {
    if (cover.status !== "page" && cover.status !== "override") return { mode: "hidden" };
    const src = cover.coverUrl ?? cover.remoteUrl;
    if (!src) return { mode: "hidden" };
    return { mode: "show", src };
  }
  return { mode: "show", src: cover.coverUrl ?? cover.remoteUrl ?? "/images/unknown_source.png" };
};
