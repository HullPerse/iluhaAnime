use super::*;

impl TorrentManager {
    pub async fn update_torrent_only_files(
        self: &Arc<Self>,
        id: usize,
        only_files: Vec<usize>,
        info_hash: Option<String>,
    ) -> Result<(), String> {
        self.verify_torrent(id, info_hash.as_deref())?;
        let handle_opt = self.session.with_torrents(|iter| {
            for (tid, handle) in iter {
                if tid == id {
                    return Some(handle.clone());
                }
            }
            None
        });

        let handle = handle_opt.ok_or_else(|| "torrent not found".to_string())?;
        let key = handle.info_hash().as_string();
        let only: HashSet<usize> = only_files.iter().copied().collect();

        let result = self
            .session
            .update_only_files(&handle, &only)
            .await
            .map_err(|e| format!("{e}"));
        if result.is_ok() {
            self.file_priorities.remove(&key);
            self.materialize_priorities(&handle, &key, &only_files);
            self.reconcile_file_visibility();
            self.detect_missing_payload(id);
        }
        result
    }

    pub async fn set_file_priority(
        self: &Arc<Self>,
        id: usize,
        file_indices: Vec<usize>,
        priority: FilePriority,
        info_hash: Option<String>,
    ) -> Result<(), String> {
        self.verify_torrent(id, info_hash.as_deref())?;
        let key = self
            .torrent_info_hash(id)
            .ok_or_else(|| "Torrent not found".to_string())?;
        {
            let mut entry = self.file_priorities.entry(key.clone()).or_default();
            for &idx in &file_indices {
                if idx < entry.len() {
                    entry[idx] = priority;
                }
            }
        }
        self.save_preferences();

        if priority == FilePriority::DoNotDownload || priority == FilePriority::Normal {
            let handle = self
                .session
                .with_torrents(|iter| {
                    for (tid, handle) in iter {
                        if tid == id {
                            return Some(handle.clone());
                        }
                    }
                    None
                })
                .ok_or_else(|| "Torrent not found".to_string())?;

            let file_count = handle.stats().file_progress.len();
            let only: Vec<usize> = handle
                .only_files()
                .unwrap_or_else(|| (0..file_count).collect());
            let mut new_only = only.clone();

            if priority == FilePriority::DoNotDownload {
                for idx in &file_indices {
                    new_only.retain(|&i| i != *idx);
                }
            } else {
                for idx in &file_indices {
                    if !new_only.contains(idx) {
                        new_only.push(*idx);
                    }
                }
            }

            if new_only != only {
                let set: HashSet<usize> = new_only.into_iter().collect();
                self.session
                    .update_only_files(&handle, &set)
                    .await
                    .map_err(|e| format!("{e:#}"))?;
                self.reconcile_file_visibility();
            }
        }

        Ok(())
    }

    pub async fn set_sequential_download(
        self: &Arc<Self>,
        id: usize,
        enabled: bool,
        info_hash: Option<String>,
    ) -> Result<(), String> {
        self.verify_torrent(id, info_hash.as_deref())?;
        let handle = self
            .torrent_handle(id)
            .ok_or_else(|| "Torrent not found".to_string())?;
        let key = handle.info_hash().as_string();

        if enabled {
            self.sequential_torrents.insert(key);
            self.save_preferences();
            self.advance_sequential(id).await?;
        } else {
            self.sequential_torrents.remove(&key);
            self.save_preferences();
            self.stop_priority_stream(id);
            if let Some(plan) = self.sequential_plan(id, &handle) {
                self.sync_session_selection(
                    &handle,
                    &plan.allowed,
                    handle.stats().file_progress.len(),
                )
                .await?;
            }
        }
        Ok(())
    }

    pub async fn set_torrent_download_order(
        self: &Arc<Self>,
        id: usize,
        file_indices: Vec<usize>,
        info_hash: Option<String>,
    ) -> Result<(), String> {
        self.verify_torrent(id, info_hash.as_deref())?;
        let handle = self
            .torrent_handle(id)
            .ok_or_else(|| "Torrent not found".to_string())?;
        let key = handle.info_hash().as_string();
        let file_count = handle
            .with_metadata(|metadata| metadata.file_infos.len())
            .ok();
        let mut queue: Vec<usize> = Vec::with_capacity(file_indices.len());
        for index in file_indices {
            if queue.contains(&index) || file_count.is_some_and(|count| index >= count) {
                continue;
            }
            queue.push(index);
        }

        if queue.is_empty() {
            self.download_order.remove(&key);
        } else {
            self.download_order.insert(key, queue);
        }
        self.save_preferences();

        if self.is_sequential(id) {
            self.advance_sequential(id).await?;
        }
        Ok(())
    }

    pub(super) fn sequential_plan(
        &self,
        id: usize,
        handle: &Arc<librqbit::ManagedTorrent>,
    ) -> Option<SequentialPlan> {
        let files: Vec<(String, u64)> = handle
            .with_metadata(|metadata| {
                metadata
                    .file_infos
                    .iter()
                    .map(|file| {
                        (
                            file.relative_filename.to_string_lossy().to_string(),
                            file.len,
                        )
                    })
                    .collect()
            })
            .ok()?;
        if files.is_empty() {
            return None;
        }
        let names: Vec<String> = files.iter().map(|(name, _)| name.clone()).collect();
        let lengths: Vec<u64> = files.iter().map(|(_, length)| *length).collect();
        let key = handle.info_hash().as_string();
        let priorities = self.file_priorities.get(&key).map(|entry| entry.clone());
        let pending = self.pending_selections.get(&id).map(|entry| entry.clone());
        let queue = self.download_order.get(&key).map(|entry| entry.clone());
        Some(plan_sequential(
            &names,
            &lengths,
            &handle.stats().file_progress,
            priorities.as_deref(),
            pending.as_deref(),
            self.file_order(),
            queue.as_deref().unwrap_or_default(),
        ))
    }

    pub(super) async fn sync_session_selection(
        &self,
        handle: &Arc<librqbit::ManagedTorrent>,
        allowed: &[usize],
        file_count: usize,
    ) -> Result<(), String> {
        let expected: HashSet<usize> = allowed.iter().copied().collect();
        let selected: HashSet<usize> = handle.only_files().map_or_else(
            || (0..file_count).collect(),
            |files| files.into_iter().collect(),
        );
        if selected == expected {
            return Ok(());
        }
        self.session
            .update_only_files(handle, &expected)
            .await
            .map_err(|error| format!("{error:#}"))
    }

    pub async fn advance_sequential(self: &Arc<Self>, id: usize) -> Result<(), String> {
        let handle = self
            .torrent_handle(id)
            .ok_or_else(|| "Torrent not found".to_string())?;

        let stats = handle.stats();
        if matches!(stats.state, TorrentStatsState::Initializing { .. }) {
            return Ok(());
        }

        let Some(plan) = self.sequential_plan(id, &handle) else {
            return Ok(());
        };
        self.sync_session_selection(&handle, &plan.allowed, stats.file_progress.len())
            .await?;

        match plan.target {
            Some(target) if !self.torrent_is_paused(id) => {
                self.hold_priority_stream(id, target, &handle);
            }
            Some(_) => self.stop_priority_stream(id),
            None => {
                self.stop_priority_stream(id);
            }
        }
        Ok(())
    }

    pub(super) fn hold_priority_stream(
        self: &Arc<Self>,
        id: usize,
        file_id: usize,
        handle: &Arc<librqbit::ManagedTorrent>,
    ) {
        if let Some(current) = self.sequential_streams.get(&id) {
            if current.0 == file_id && !current.1.is_finished() {
                return;
            }
        }
        self.stop_priority_stream(id);

        let manager = Arc::clone(self);
        let handle = Arc::clone(handle);
        let task = tokio::spawn(async move {
            let mut stream = match handle.clone().stream(file_id).await {
                Ok(stream) => stream,
                Err(error) => {
                    tracing::warn!(
                        "sequential mode could not prioritize file {file_id} of torrent {id}: \
                         {error:#}"
                    );
                    return;
                }
            };
            loop {
                let progress = handle
                    .stats()
                    .file_progress
                    .get(file_id)
                    .copied()
                    .unwrap_or(0);
                let seek =
                    tokio::io::AsyncSeekExt::seek(&mut stream, std::io::SeekFrom::Start(progress));
                if seek.await.is_err() {
                    return;
                }
                tokio::time::sleep(SEQUENTIAL_PRIORITY_TICK).await;
                if !manager.is_sequential(id) || manager.torrent_handle(id).is_none() {
                    return;
                }
            }
        });
        self.sequential_streams.insert(id, (file_id, task));
    }

    pub(super) fn stop_priority_stream(&self, id: usize) {
        if let Some((_, (_, task))) = self.sequential_streams.remove(&id) {
            task.abort();
        }
    }

    pub async fn advance_sequential_torrents(self: &Arc<Self>) {
        let sequential: Vec<usize> = self
            .session
            .with_torrents(|iter| {
                iter.map(|(id, handle)| (id, handle.info_hash().as_string()))
                    .collect::<Vec<_>>()
            })
            .into_iter()
            .filter(|(_, key)| self.sequential_torrents.contains(key))
            .map(|(id, _)| id)
            .collect();
        let mut sequential = sequential;
        sequential.sort_unstable();
        for id in sequential.iter().skip(MAX_SEQUENTIAL_PRIORITY_STREAMS) {
            self.stop_priority_stream(*id);
        }
        for id in sequential.into_iter().take(MAX_SEQUENTIAL_PRIORITY_STREAMS) {
            if let Err(error) = self.advance_sequential(id).await {
                tracing::warn!("sequential download step failed for torrent {id}: {error}");
            }
        }
    }

    pub(super) fn check_torrent_files(
        &self,
        id: usize,
        info_hash: Option<String>,
    ) -> Result<TorrentCheckResult, String> {
        self.verify_torrent(id, info_hash.as_deref())?;
        let save_dir = self
            .registry
            .save_dirs
            .get(&id)
            .map(|r| r.clone())
            .unwrap_or_default();
        if save_dir.is_empty() {
            return Err("torrent not found".to_string());
        }
        let result = self.session.with_torrents(|iter| {
            for (tid, handle) in iter {
                if tid == id {
                    let h = handle.clone();
                    return h
                        .with_metadata(|m| {
                            let mut missing = Vec::new();
                            let mut size_mismatch = Vec::new();
                            let mut ok = 0usize;
                            let mut total = 0usize;
                            for f in &m.file_infos {
                                if !is_safe_relative_path(&f.relative_filename.to_string_lossy()) {
                                    continue;
                                }
                                total += 1;
                                let full_path = resolve_payload_path(
                                    &Path::new(&save_dir).join(&f.relative_filename),
                                );
                                match std::fs::metadata(&full_path) {
                                    Ok(meta) if meta.is_file() && meta.len() == f.len => ok += 1,
                                    Ok(meta) if meta.is_file() => {
                                        size_mismatch.push(
                                            f.relative_filename.to_string_lossy().to_string(),
                                        );
                                    }
                                    _ => {
                                        missing.push(
                                            f.relative_filename.to_string_lossy().to_string(),
                                        );
                                    }
                                }
                            }
                            Some(TorrentCheckResult {
                                id,
                                missing,
                                size_mismatch,
                                ok,
                                total,
                            })
                        })
                        .unwrap_or(None);
                }
            }
            None
        });
        let check = result.ok_or_else(|| "torrent not found or no metadata".to_string())?;
        self.missing_files.insert(id, !check.missing.is_empty());
        Ok(check)
    }

    /// The user asked to verify the files, so the on-disk state becomes the new
    /// external-change baseline. A lightweight size check cannot clear a badge
    /// that was raised by the app's own finalization pass unless it resets it.
    pub fn recheck_torrent(
        &self,
        id: usize,
        info_hash: Option<String>,
    ) -> Result<TorrentCheckResult, String> {
        let check = self.check_torrent_files(id, info_hash)?;
        if let Some(key) = self.torrent_info_hash(id) {
            self.invalidate_file_baseline(&key);
            self.snapshot_torrent_files(id);
        }
        Ok(check)
    }

    pub fn verify_pending_missing(&self, torrents: &mut [TorrentInfo], limit: usize) {
        let mut checked = 0;
        for candidate in torrents
            .iter_mut()
            .filter(|torrent| torrent.finished || torrent.error.is_some())
        {
            if checked >= limit {
                break;
            }
            if self.missing_files.contains_key(&candidate.id) {
                continue;
            }
            checked += 1;
            let verdict = self
                .check_torrent_files(candidate.id, Some(candidate.info_hash.clone()))
                .map(|result| !result.missing.is_empty());
            let missing = verdict.unwrap_or(false);
            self.missing_files.insert(candidate.id, missing);
            candidate.missing_files = missing;
        }
    }

    pub fn torrent_diagnostics(
        &self,
        id: usize,
        info_hash: Option<String>,
    ) -> Result<TorrentDiagnostics, String> {
        self.verify_torrent(id, info_hash.as_deref())?;
        let found = self.session.with_torrents(|iter| {
            for (tid, handle) in iter {
                if tid != id {
                    continue;
                }
                let mut peers: Vec<TorrentDiagPeer> = handle
                    .live()
                    .map(|live| {
                        live.per_peer_stats_snapshot(PeerStatsFilter::default())
                            .peers
                            .into_iter()
                            .map(|(addr, stats)| TorrentDiagPeer {
                                country: country_code_for_addr(&addr).map(ToString::to_string),
                                addr,
                                state: stats.state.to_string(),
                                client_name: stats.client_name,
                                conn_kind: stats.conn_kind.map(|kind| kind.to_string()),
                                down_bytes: stats.counters.fetched_bytes,
                                up_bytes: stats.counters.uploaded_bytes,
                                errors: stats.counters.errors,
                            })
                            .collect()
                    })
                    .unwrap_or_default();
                peers.sort_by_key(|peer| std::cmp::Reverse(peer.down_bytes));
                peers.truncate(100);
                let mut trackers: Vec<String> = handle
                    .shared()
                    .trackers
                    .iter()
                    .map(ToString::to_string)
                    .collect();
                trackers.sort();
                return Some(TorrentDiagnostics {
                    id,
                    peers,
                    trackers,
                });
            }
            None
        });
        found.ok_or_else(|| "Torrent not found".to_string())
    }
}
