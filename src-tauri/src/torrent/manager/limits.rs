use super::*;

impl TorrentManager {
    pub fn get_torrent_limits(&self, id: usize) -> TorrentLimits {
        self.torrent_info_hash(id)
            .and_then(|key| self.get_torrent_limits_by_key(&key))
            .unwrap_or_default()
    }

    fn get_torrent_limits_by_key(&self, key: &str) -> Option<TorrentLimits> {
        self.registry.torrent_limits.get(key).map(|entry| *entry.value())
    }

    #[allow(clippy::too_many_lines)]
    pub async fn set_torrent_limits(
        self: &Arc<Self>,
        id: usize,
        limits: TorrentLimits,
        info_hash: Option<String>,
    ) -> Result<(), String> {
        let lock = self
            .limit_locks
            .entry(id)
            .or_insert_with(|| Arc::new(tokio::sync::Mutex::new(())))
            .clone();
        let _guard = lock.lock().await;
        self.verify_torrent(id, info_hash.as_deref())?;
        let previous_limits = self.get_torrent_limits(id);
        let source = self
            .torrent_source(id)
            .ok_or_else(|| "torrent metainfo is unavailable, try again".to_string())?;
        let key = self
            .torrent_info_hash(id)
            .ok_or_else(|| "Torrent not found".to_string())?;
        let magnet = self.registry.magnet_links.get(&id).map(|entry| entry.clone());
        let save_dir = self
            .registry.save_dirs
            .get(&id)
            .map(|entry| entry.clone())
            .ok_or_else(|| "Torrent save directory is unavailable".to_string())?;
        let selected_files = self
            .get_running_torrent_files(id)
            .ok()
            .map(|files| {
                files
                    .into_iter()
                    .filter(|file| file.selected)
                    .map(|file| file.index)
                    .collect::<Vec<_>>()
            })
            .filter(|files: &Vec<usize>| !files.is_empty());
        let was_paused = self.torrent_is_paused(id);
        let root_name = self.registry.root_names.get(&key).map(|entry| entry.clone());

        if limits == TorrentLimits::default() {
            self.registry.torrent_limits.remove(&key);
        } else {
            self.registry.torrent_limits.insert(key.clone(), limits);
        }
        self.registry.save_torrent_limits();

        let _rewriting = self.rewrite_guard();
        self.capture_rewrite_ghost(id, &key);
        if let Err(error) = self.session.delete(id.into(), false).await {
            self.clear_rewrite_ghost(&key);
            if previous_limits == TorrentLimits::default() {
                self.registry.torrent_limits.remove(&key);
            } else {
                self.registry.torrent_limits.insert(key.clone(), previous_limits);
            }
            self.registry.save_torrent_limits();
            return Err(format!("unable to reconfigure torrent: {error:#}"));
        }
        self.registry.save_save_dirs();
        self.registry.save_magnet_links();

        let result = self
            .add_torrent_inner(
                source.to_add_torrent(true),
                save_dir.clone(),
                selected_files.clone(),
                None,
                Some(id),
                magnet.clone(),
                to_rqbit_limits(limits),
                true,
                false,
                was_paused,
                false,
                root_name.clone(),
            )
            .await
            .map_err(|error| format!("unable to reconfigure torrent: {error:#}"));
        self.clear_rewrite_ghost(&key);

        if result.is_err() {
            if previous_limits == TorrentLimits::default() {
                self.registry.torrent_limits.remove(&key);
            } else {
                self.registry.torrent_limits.insert(key.clone(), previous_limits);
            }
            self.registry.save_torrent_limits();
            if let Err(restore_error) = self
                .add_torrent_inner(
                    source.to_add_torrent(true),
                    save_dir,
                    selected_files,
                    None,
                    Some(id),
                    magnet,
                    to_rqbit_limits(previous_limits),
                    true,
                    false,
                    was_paused,
                    false,
                    root_name,
                )
                .await
            {
                return Err(format!(
                    "torrent reconfigure failed and the torrent is gone: {restore_error:#}"
                ));
            }
        }

        if result.is_ok() {
            if self.is_sequential(id) {
                self.advance_sequential(id).await?;
            }
            self.save_preferences();
        }
        result.map(|_| ())
    }

    pub fn set_global_limits(
        &self,
        download_bps: Option<NonZeroU32>,
        upload_bps: Option<NonZeroU32>,
    ) {
        self.session.ratelimits.set_download_bps(download_bps);
        self.session.ratelimits.set_upload_bps(upload_bps);
    }

    pub async fn reapply_stored_limits(self: &Arc<Self>) {
        for (id, key, limits) in self.stored_limits() {
            if let Err(error) = self.set_torrent_limits(id, limits, Some(key.clone())).await {
                tracing::warn!("could not restore the limits of torrent {id}: {error}");
            }
        }
    }

    pub(super) fn stored_limits(&self) -> Vec<(usize, String, TorrentLimits)> {
        self.session
            .with_torrents(|iter| {
                iter.map(|(id, handle)| (id, handle.info_hash().as_string()))
                    .collect::<Vec<_>>()
            })
            .into_iter()
            .filter_map(|(id, key)| {
                let limits = self.get_torrent_limits_by_key(&key)?;
                (limits != TorrentLimits::default()).then_some((id, key, limits))
            })
            .collect()
    }
}
