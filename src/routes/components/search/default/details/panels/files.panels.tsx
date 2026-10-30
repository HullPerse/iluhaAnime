import type { TorrentView } from "@/types/torrent/torrent";

import TorrentFileTree from "@/routes/components/search/default/details/tree.details";

export function FilesPanel({ view }: { view: TorrentView }) {
  return <TorrentFileTree files={view.files} rootName={view.title} />;
}
