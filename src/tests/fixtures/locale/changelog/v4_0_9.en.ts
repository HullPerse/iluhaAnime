const changelog409 = {
  "changelog.4_0_9.added.peers_modal":
    "Peers and trackers open in a tabbed modal instead of an inline section",
  "changelog.4_0_9.added.peer_table":
    "Peer list shows country, client, connection kind, transferred bytes and errors, busiest first",
  "changelog.4_0_9.added.peer_flags":
    "Country flag next to every peer, resolved on this machine from a bundled GeoIP table",
  "changelog.4_0_9.added.trackers_edit": "Trackers can be added and removed from the peer modal",
  "changelog.4_0_9.added.copy_app_link":
    "Copy a torrent as an iluhaanime:// link straight from the peer modal",
  "changelog.4_0_9.added.queue_order":
    "Reorder the torrent list by hand, and the order survives a restart",
  "changelog.4_0_9.changed.engine": "Torrent engine updated to librqbit 9.0.1",
  "changelog.4_0_9.changed.limits_button":
    "Torrent header no longer repeats the Limits button, the editor stays in the expanded card",
  "changelog.4_0_9.changed.parse_cache":
    "Player episode titles are parsed once per file name instead of on every render",
  "changelog.4_0_9.fixed.tracker_rewrite":
    "Editing trackers no longer drops the torrent or resumes a paused one",
  "changelog.4_0_9.fixed.list_refresh":
    "Torrent list recovers on its own when the live update channel goes quiet",
  "changelog.4_0_9.fixed.sequential_toggle":
    "Sequential download switch updates at once on idle and finished torrents",
  "changelog.4_0_9.fixed.queue_move":
    "Reordering a torrent uses the current list instead of a stale one",
  "changelog.4_0_9.fixed.cover_fallback":
    "Collection covers and stills stop building a broken URL when the cached image is missing",
} as const;

export default changelog409;
