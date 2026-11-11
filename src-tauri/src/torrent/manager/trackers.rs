use super::*;

impl TorrentManager {
    pub(super) fn live_trackers(&self, id: usize) -> Result<Vec<String>, String> {
        let found = self.session.with_torrents(|iter| {
            for (tid, handle) in iter {
                if tid != id {
                    continue;
                }
                let mut trackers: Vec<String> = handle
                    .shared()
                    .trackers
                    .iter()
                    .map(|tracker| canonical_or_raw_tracker(tracker.as_ref()))
                    .collect();
                trackers.sort();
                trackers.dedup();
                return Some(trackers);
            }
            None
        });
        found.ok_or_else(|| "Torrent not found".to_string())
    }

    async fn apply_tracker_set(
        self: &Arc<Self>,
        id: usize,
        info_hash: &str,
        trackers: &[String],
    ) -> Result<(), String> {
        self.verify_torrent(id, Some(info_hash))?;
        let name = self
            .collect_torrents()
            .into_iter()
            .find(|torrent| torrent.id == id)
            .map(|torrent| torrent.name);
        let mut merged: Vec<String> = trackers.to_vec();
        if !merged.is_empty() {
            let mut known: std::collections::HashSet<String> = merged
                .iter()
                .map(|tracker| canonical_or_raw_tracker(tracker))
                .collect();
            for fallback in FALLBACK_TRACKERS {
                let canonical = canonical_or_raw_tracker(fallback);
                if known.insert(canonical.clone()) {
                    merged.push(canonical);
                }
            }
        }
        let magnet = build_magnet(info_hash, &merged, name.as_deref())?;
        let source = self.tracker_source(id, info_hash, name.as_deref(), &merged);
        let rollback = self
            .torrent_source(id)
            .unwrap_or_else(|| TorrentSource::Magnet(magnet.clone()));
        let selected: Vec<usize> = self
            .get_running_torrent_files(id)?
            .iter()
            .filter(|file| file.selected)
            .map(|file| file.index)
            .collect();
        self.replace_torrent(
            id,
            source,
            rollback,
            magnet,
            Some(selected),
            Some(info_hash),
            false,
            false,
        )
        .await?;
        self.pending_selections.remove(&id);
        Ok(())
    }

    pub async fn add_torrent_tracker(
        self: &Arc<Self>,
        id: usize,
        tracker: String,
        info_hash: String,
    ) -> Result<(), String> {
        self.verify_torrent(id, Some(info_hash.as_str()))?;
        let canonical = validate_tracker_url(&tracker)?;
        let mut trackers = self.live_trackers(id)?;
        if trackers.iter().any(|existing| existing == &canonical) {
            return Ok(());
        }
        trackers.push(canonical);
        trackers.sort();
        self.apply_tracker_set(id, &info_hash, &trackers).await
    }

    pub async fn remove_torrent_tracker(
        self: &Arc<Self>,
        id: usize,
        tracker: String,
        info_hash: String,
    ) -> Result<(), String> {
        self.verify_torrent(id, Some(info_hash.as_str()))?;
        let canonical = validate_tracker_url(&tracker)?;
        let mut trackers = self.live_trackers(id)?;
        let before = trackers.len();
        trackers.retain(|existing| existing != &canonical);
        if trackers.len() == before {
            return Err("Tracker not found on this torrent".to_string());
        }
        self.apply_tracker_set(id, &info_hash, &trackers).await
    }
}
