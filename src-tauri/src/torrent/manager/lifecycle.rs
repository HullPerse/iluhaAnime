use super::*;

impl TorrentManager {
    pub(super) fn file_stamps(&self, id: usize) -> Option<Vec<FileStamp>> {
        let save_dir = self.registry.save_dirs.get(&id).map(|r| r.clone())?;
        let handle = self.torrent_handle(id)?;
        handle
            .with_metadata(|metadata| {
                metadata
                    .file_infos
                    .iter()
                    .filter(|file| is_safe_relative_path(&file.relative_filename.to_string_lossy()))
                    .map(|file| {
                        let full_path = resolve_payload_path(
                            &Path::new(&save_dir).join(&file.relative_filename),
                        );
                        let meta = std::fs::metadata(&full_path)
                            .ok()
                            .filter(std::fs::Metadata::is_file);
                        FileStamp {
                            name: file.relative_filename.to_string_lossy().to_string(),
                            expected_len: file.len,
                            on_disk_len: meta.as_ref().map(std::fs::Metadata::len),
                            mtime_secs: meta
                                .as_ref()
                                .and_then(|m| m.modified().ok())
                                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                                .map(|d| d.as_secs() as i64),
                        }
                    })
                    .collect()
            })
            .ok()
    }

    pub(super) fn snapshot_torrent_files(&self, id: usize) {
        let Some(key) = self.torrent_info_hash(id) else {
            return;
        };
        if let Some(stamps) = self.file_stamps(id) {
            self.file_snapshots.insert(key.clone(), stamps);
            self.file_watch_cache.remove(&key);
        }
    }

    /// Drop the external-change baseline after the app itself moved or removed
    /// a payload. The next watch re-snapshots instead of reporting our own edit.
    pub(super) fn invalidate_file_baseline(&self, key: &str) {
        self.file_snapshots.remove(key);
        self.file_watch_cache.remove(key);
    }

    pub fn watch_external_files(&self, torrents: &mut [TorrentInfo]) {
        for torrent in torrents.iter_mut() {
            let changed = self.external_files_changed(torrent.id, torrent.finished);
            torrent.external_changed_files = changed.clone();
            torrent.external_changes = !changed.is_empty();
        }
    }

    pub(super) fn external_files_changed(&self, id: usize, finished: bool) -> Vec<String> {
        let Some(handle) = self.torrent_handle(id) else {
            return Vec::new();
        };
        if !finished && !handle.is_paused() {
            return Vec::new();
        }
        let key = handle.info_hash().as_string();
        let Some(snapshot) = self.file_snapshots.get(&key).map(|entry| entry.clone()) else {
            self.snapshot_torrent_files(id);
            return Vec::new();
        };
        if let Some(entry) = self.file_watch_cache.get(&key) {
            let (checked_at, changed) = entry.value().clone();
            if checked_at.elapsed() < PAUSE_WATCH_INTERVAL {
                return changed;
            }
        }
        let changed = self
            .file_stamps(id)
            .map(|stamps| Self::changed_file_names(&snapshot, &stamps))
            .unwrap_or_default();
        self.file_watch_cache
            .insert(key, (Instant::now(), changed.clone()));
        changed
    }

    pub(super) fn changed_file_names(before: &[FileStamp], after: &[FileStamp]) -> Vec<String> {
        if before.len() != after.len() {
            return Vec::new();
        }
        before
            .iter()
            .zip(after)
            .filter(|(a, b)| {
                a.name != b.name || a.on_disk_len != b.on_disk_len || a.mtime_secs != b.mtime_secs
            })
            .map(|(a, _)| a.name.clone())
            .collect()
    }

    pub(super) fn check_from_stamps(id: usize, stamps: &[FileStamp]) -> TorrentCheckResult {
        let mut missing = Vec::new();
        let mut size_mismatch = Vec::new();
        let mut ok = 0usize;
        for stamp in stamps {
            match stamp.on_disk_len {
                None => missing.push(stamp.name.clone()),
                Some(len) if len == stamp.expected_len => ok += 1,
                Some(_) => size_mismatch.push(stamp.name.clone()),
            }
        }
        TorrentCheckResult {
            id,
            missing,
            size_mismatch,
            ok,
            total: stamps.len(),
        }
    }

    pub(super) async fn reverify_from_disk(
        self: &Arc<Self>,
        id: usize,
        info_hash: &str,
    ) -> Result<usize, String> {
        let selected = self
            .get_running_torrent_files(id)
            .ok()
            .map(|files| {
                files
                    .into_iter()
                    .filter(|file| file.selected)
                    .map(|file| file.index)
                    .collect::<Vec<_>>()
            })
            .filter(|files| !files.is_empty());
        let source = self
            .torrent_source(id)
            .ok_or_else(|| "the torrent metainfo is unavailable, try again".to_string())?;
        let magnet = self
            .registry
            .magnet_links
            .get(&id)
            .map(|entry| entry.clone())
            .unwrap_or_else(|| format!("magnet:?xt=urn:btih:{info_hash}"));
        self.replace_torrent(
            id,
            source.clone(),
            source,
            magnet,
            selected,
            Some(info_hash),
            true,
            false,
        )
        .await
    }

    /// Rename the finished `<name>.part` payloads of every torrent. The pass
    /// runs on every tick, before the watcher ignore set is rebuilt, so a
    /// payload that just finished reaches its final name before the watcher
    /// can drop the event of that name.
    pub fn finalize_part_files_pass(&self) {
        self.session.with_torrents(|iter| {
            for (id, handle) in iter {
                let Some(save_dir) = self.registry.save_dirs.get(&id).map(|entry| entry.clone())
                else {
                    continue;
                };
                let key = handle.info_hash().as_string();
                let stats = handle.stats();
                self.finalize_part_files(&key, handle, &stats, &save_dir);
            }
        });
    }

    pub fn reconcile_file_visibility(&self) {
        self.session.with_torrents(|iter| {
            for (id, handle) in iter {
                self.reconcile_torrent_files(id, handle);
            }
        });
    }

    pub fn reconcile_torrent(&self, id: usize) {
        if let Some(handle) = self.torrent_handle(id) {
            self.reconcile_torrent_files(id, &handle);
        }
    }

    pub(super) fn reconcile_torrent_files(
        &self,
        id: usize,
        handle: &Arc<librqbit::ManagedTorrent>,
    ) {
        let Some(save_dir) = self.registry.save_dirs.get(&id).map(|entry| entry.clone()) else {
            return;
        };
        let key = handle.info_hash().as_string();
        let stats = handle.stats();
        if stats.finished {
            let same_folder = self
                .registry
                .partial_leftovers
                .get(&key)
                .is_some_and(|record| record.save_dir == save_dir);
            if same_folder && self.registry.partial_leftovers.remove(&key).is_some() {
                self.registry.save_partial_leftovers();
            }
        }
        let mut changed = false;
        {
            let mut hidden = self.hidden_files.entry(id).or_default();
            // The payload of a new download lives in the `.part` twin. The
            // pass learns the twins once, hides each one, and then stops
            // asking the filesystem about them.
            let mut twins = self.part_twins.entry(id).or_default();
            // One `read_dir` per parent directory instead of one `metadata`
            // per payload. Payloads can live in subfolders, so the names have
            // to be looked up in their own directory, not only in save_dir.
            let mut dir_entries: HashMap<PathBuf, HashSet<std::ffi::OsString>> = HashMap::new();
            let _ = handle.with_metadata(|metadata| {
                for (index, file) in metadata.file_infos.iter().enumerate() {
                    if file.attrs.padding {
                        continue;
                    }
                    if !is_safe_relative_path(&file.relative_filename.to_string_lossy()) {
                        continue;
                    }
                    let path = Path::new(&save_dir).join(&file.relative_filename);
                    let path_key = path.to_string_lossy().to_string();
                    let remembered = self
                        .registry
                        .hidden_paths
                        .get(&key)
                        .is_some_and(|entry| entry.contains(&path_key));
                    let progress = stats.file_progress.get(index).copied().unwrap_or(0);
                    let complete = file.len == 0 || progress >= file.len;
                    let was_hidden = hidden.contains(&index);

                    if complete {
                        // Completed files are the common case, so only touch the
                        // filesystem when this torrent is known to have hidden them.
                        if twins.remove(&index) {
                            // The payload left its `.part` twin, so the
                            // remembered path of the twin is stale.
                            let part_path = part_file_path(&path);
                            let part_key = part_path.to_string_lossy();
                            changed |= self.forget_hidden_path(&key, &part_key);
                        }
                        if !was_hidden && !remembered {
                            continue;
                        }
                        if disk::is_hidden(&path) {
                            disk::unhide_file(&path);
                        }
                        hidden.remove(&index);
                        changed |= self.forget_hidden_path(&key, &path_key);
                        continue;
                    }

                    if was_hidden || remembered {
                        // The registry outlives the process, not the file.
                        // Forget a missing path instead of treating a later
                        // file with the same name as hidden forever.
                        if !dir_has_entry(&mut dir_entries, &path)
                            || !std::fs::metadata(&path).is_ok_and(|meta| meta.is_file())
                        {
                            hidden.remove(&index);
                            changed |= self.forget_hidden_path(&key, &path_key);
                            continue;
                        }
                        hidden.insert(index);
                        continue;
                    }
                    // The payload of an unfinished file is the `.part` twin
                    // while the twin exists, and the final name for a torrent
                    // that was added before the `.part` support. The pass
                    // learns the twins, so it stops asking about them.
                    if twins.contains(&index) {
                        continue;
                    }
                    let part_path = part_file_path(&path);
                    if part_path.is_file() {
                        // The payload of a new download lives in the `.part`
                        // twin; hiding it keeps the save folder showing only
                        // finished files. The twin is learned once, so the
                        // pass stops asking the filesystem about it, and the
                        // path is remembered so the sweep can reveal a twin
                        // whose torrent is gone.
                        disk::hide_file(&part_path);
                        twins.insert(index);
                        let part_key = part_path.to_string_lossy();
                        changed |= self.remember_hidden_path(&key, &part_key);
                        continue;
                    }
                    if !dir_has_entry(&mut dir_entries, &path)
                        || !std::fs::metadata(&path).is_ok_and(|meta| meta.is_file())
                    {
                        continue;
                    }
                    disk::hide_file(&path);
                    hidden.insert(index);
                    changed |= self.remember_hidden_path(&key, &path_key);
                }
            });
        }
        if changed {
            self.registry.save_hidden_paths();
        }
    }

    /// Rename finished `<name>.part` files to their final name. The first
    /// pass after the torrent appears also covers files that completed while
    /// the app was closed; later passes only touch files that just reached
    /// 100%, so a large finished torrent costs nothing per tick. A rename
    /// blocked by an open handle keeps its pending flag and is retried.
    pub(super) fn finalize_part_files(
        &self,
        key: &str,
        handle: &Arc<librqbit::ManagedTorrent>,
        stats: &librqbit::TorrentStats,
        save_dir: &str,
    ) {
        let Ok(file_count) = handle.with_metadata(|metadata| metadata.file_infos.len()) else {
            return;
        };
        let mut finalize = self.part_finalize.entry(key.to_string()).or_default();
        if finalize.done.len() != file_count {
            finalize.done.resize(file_count, false);
        }
        if finalize.was_finished && !stats.finished {
            // The torrent was finished and now downloads again, so its
            // payloads may be partials once more and need a fresh pass.
            finalize.done.iter_mut().for_each(|flag| *flag = false);
        }
        finalize.was_finished = stats.finished;
        let mut done: Vec<usize> = Vec::new();
        let mut mutated = false;
        let _ = handle.with_metadata(|metadata| {
            for (index, file) in metadata.file_infos.iter().enumerate() {
                if finalize.done.get(index).is_some_and(|flag| *flag) {
                    continue;
                }
                let progress = stats.file_progress.get(index).copied().unwrap_or(0);
                let complete = file.len == 0 || progress >= file.len;
                if complete {
                    if file.attrs.padding
                        || !is_safe_relative_path(&file.relative_filename.to_string_lossy())
                    {
                        done.push(index);
                        continue;
                    }
                    let final_path = Path::new(save_dir).join(&file.relative_filename);
                    let part_path = part_file_path(&final_path);
                    match std::fs::rename(&part_path, &final_path) {
                        // NotFound is the normal case: the file was never a
                        // partial, or an earlier pass already renamed it.
                        Ok(()) => {
                            // A rename keeps the attributes, and the payload
                            // was hidden while it was a `.part` twin.
                            disk::unhide_file(&final_path);
                            mutated = true;
                            done.push(index);
                        }
                        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                            done.push(index);
                        }
                        Err(error) => {
                            tracing::warn!(
                                part = %part_path.display(),
                                final_path = %final_path.display(),
                                %error,
                                "could not finalize part file"
                            );
                        }
                    }
                }
            }
        });
        for index in done {
            if let Some(flag) = finalize.done.get_mut(index) {
                *flag = true;
            }
        }
        if mutated {
            self.invalidate_file_baseline(key);
        }
    }

    /// Queue a repair for every torrent whose selected payload vanished from
    /// disk. The engine keeps writing into the deleted file's handle, so a
    /// re-add is the only way to make the bytes land in the folder again.
    pub fn detect_missing_payloads(&self) {
        self.session.with_torrents(|iter| {
            for (id, handle) in iter {
                self.queue_payload_repair(id, handle);
            }
        });
    }

    /// The same check for one torrent: after a selection change or a resume.
    pub fn detect_missing_payload(&self, id: usize) {
        if let Some(handle) = self.torrent_handle(id) {
            self.queue_payload_repair(id, &handle);
        }
    }

    pub(super) fn queue_payload_repair(&self, id: usize, handle: &Arc<librqbit::ManagedTorrent>) {
        let Some(save_dir) = self.registry.save_dirs.get(&id).map(|entry| entry.clone()) else {
            return;
        };
        let stats = handle.stats();
        if stats.finished || matches!(stats.state, TorrentStatsState::Initializing { .. }) {
            return;
        }
        let key = handle.info_hash().as_string();
        if self.repair_requests.contains_key(&key) {
            return;
        }
        if self
            .last_repair
            .get(&key)
            .is_some_and(|at| at.elapsed() < REPAIR_COOLDOWN)
        {
            return;
        }
        let selection = handle.only_files();
        let missing = handle
            .with_metadata(|metadata| {
                metadata.file_infos.iter().enumerate().any(|(index, file)| {
                    if file.attrs.padding
                        || !is_safe_relative_path(&file.relative_filename.to_string_lossy())
                    {
                        return false;
                    }
                    if selection
                        .as_ref()
                        .is_some_and(|selected| !selected.contains(&index))
                    {
                        return false;
                    }
                    let progress = stats.file_progress.get(index).copied().unwrap_or(0);
                    if progress == 0 || progress >= file.len {
                        return false;
                    }
                    let final_path = Path::new(&save_dir).join(&file.relative_filename);
                    !resolve_payload_path(&final_path).exists()
                })
            })
            .unwrap_or(false);
        if !missing {
            return;
        }
        let was_live = !self.torrent_is_paused(id);
        tracing::info!(torrent = id, info_hash = %key, "payload files are missing, repair queued");
        self.repair_requests
            .insert(key, RepairRequest { id, was_live });
    }

    /// Re-add the torrents whose payload vanished. The re-add recreates the
    /// `.part` twins and re-checks the bytes that are still there; a torrent
    /// that was downloading resumes when the repair is done.
    pub async fn process_repair_requests(self: &Arc<Self>) {
        if self.repair_requests.is_empty() || self.is_rewriting() {
            return;
        }
        let requests: Vec<(String, RepairRequest)> = self
            .repair_requests
            .iter()
            .map(|entry| (entry.key().clone(), entry.value().clone()))
            .collect();
        for (key, request) in requests {
            self.repair_requests.remove(&key);
            let Some(handle) = self.torrent_handle(request.id) else {
                continue;
            };
            if handle.info_hash().as_string() != key {
                // The id belongs to another torrent by now.
                continue;
            }
            let selected: Option<Vec<usize>> =
                self.get_running_torrent_files(request.id)
                    .ok()
                    .map(|files| {
                        files
                            .into_iter()
                            .filter(|file| file.selected)
                            .map(|file| file.index)
                            .collect()
                    });
            let Some(source) = self.torrent_source(request.id) else {
                continue;
            };
            let magnet = self
                .registry
                .magnet_links
                .get(&request.id)
                .map(|entry| entry.clone())
                .unwrap_or_else(|| format!("magnet:?xt=urn:btih:{key}"));
            let repaired = self
                .replace_torrent(
                    request.id,
                    source.clone(),
                    source,
                    magnet,
                    selected,
                    Some(&key),
                    true,
                    true,
                )
                .await;
            self.last_repair.insert(key.clone(), Instant::now());
            match repaired {
                Ok(new_id) => {
                    tracing::info!(torrent = new_id, info_hash = %key, "payload repair re-added the torrent");
                    if request.was_live {
                        if let Some(handle) = self.torrent_handle(new_id) {
                            if handle.is_paused() && !self.start_torrent(new_id, &handle).await {
                                self.pending_starts.insert(new_id);
                            }
                        }
                    }
                }
                Err(error) => {
                    tracing::warn!(info_hash = %key, %error, "payload repair failed");
                }
            }
        }
    }

    pub(super) fn remember_hidden_path(&self, key: &str, path: &str) -> bool {
        self.registry
            .hidden_paths
            .entry(key.to_string())
            .or_default()
            .insert(path.to_string())
    }

    pub(super) fn forget_hidden_path(&self, key: &str, path: &str) -> bool {
        let (removed, empty) = self
            .registry
            .hidden_paths
            .get_mut(key)
            .map_or((false, false), |mut entry| {
                (entry.remove(path), entry.is_empty())
            });
        if empty {
            self.registry
                .hidden_paths
                .remove_if(key, |_, paths| paths.is_empty());
        }
        removed
    }

    pub(super) fn reveal_hidden_paths(&self, key: &str, keep: &[PathBuf]) -> bool {
        let paths: Vec<String> = self
            .registry
            .hidden_paths
            .get(key)
            .map(|entry| entry.value().iter().cloned().collect())
            .unwrap_or_default();
        let mut changed = false;
        for path in paths {
            let path = Path::new(&path);
            // Windows paths compare case-insensitively, and the leftover
            // record may name the same file with a different spelling.
            if path.is_file()
                && keep.iter().any(|kept| {
                    crate::watcher::normalize_key(kept) == crate::watcher::normalize_key(path)
                })
            {
                continue;
            }
            if path.is_file() && disk::is_hidden(path) {
                disk::unhide_file(path);
            }
            changed |= self.forget_hidden_path(key, &path.to_string_lossy());
        }
        changed
    }

    pub(super) fn leftover_paths(&self, key: &str) -> Vec<PathBuf> {
        self.registry
            .partial_leftovers
            .get(key)
            .map_or_else(Vec::new, |record| {
                record
                    .files
                    .iter()
                    .map(|file| Path::new(&record.save_dir).join(&file.name))
                    .collect()
            })
    }

    /// A hidden attribute outlives the process that set it. Reveal files whose
    /// torrent is gone and that no leftover record still owns, so a crash or
    /// disabled persistence cannot leave payload invisible forever.
    pub fn sweep_stale_hidden(&self) {
        let active = self.active_info_hashes();
        let keys: Vec<String> = self
            .registry
            .hidden_paths
            .iter()
            .map(|entry| entry.key().clone())
            .collect();
        let mut changed = false;
        for key in keys {
            if active.contains(&key) {
                continue;
            }
            changed |= self.reveal_hidden_paths(&key, &self.leftover_paths(&key));
        }
        if changed {
            self.registry.save_hidden_paths();
        }
    }

    /// Output roots and exact payload paths of torrents that are downloading.
    /// The folder watcher drops writes to the payload files and directory events
    /// under the roots, while unrelated files in a shared library root still
    /// pass. A paused torrent writes nothing, so its folder stays watched.
    pub fn active_download_paths(&self) -> (Vec<String>, Vec<String>) {
        self.session.with_torrents(|iter| {
            let mut roots = Vec::with_capacity(8);
            let mut files = Vec::with_capacity(64);
            for (id, handle) in iter {
                let stats = handle.stats();
                if stats.finished || handle.is_paused() {
                    continue;
                }
                let Some(dir) = self.registry.save_dirs.get(&id).map(|entry| entry.clone()) else {
                    continue;
                };
                let only_files = handle.only_files();
                let _ = handle.with_metadata(|metadata| {
                    let mut payloads = Vec::new();
                    for (index, file) in metadata.file_infos.iter().enumerate() {
                        if file.attrs.padding {
                            continue;
                        }
                        if only_files
                            .as_ref()
                            .is_some_and(|selection| !selection.contains(&index))
                        {
                            continue;
                        }
                        payloads.push(PayloadFile {
                            relative_filename: &file.relative_filename,
                            progress: stats.file_progress.get(index).copied().unwrap_or(0),
                            len: file.len,
                        });
                    }
                    files.extend(ignored_payload_paths(&dir, &payloads));
                });
                roots.push(dir);
            }
            (roots, files)
        })
    }

    /// `None` means the platform has no sparse-file concept to report on.
    pub fn sparse_capable(&self, save_dir: &str) -> Option<bool> {
        if !cfg!(windows) || save_dir.is_empty() {
            return None;
        }
        if let Some(known) = self.sparse_cache.get(save_dir) {
            return Some(*known.value());
        }
        let supported = disk::sparse_capable(Path::new(save_dir));
        self.sparse_cache.insert(save_dir.to_string(), supported);
        Some(supported)
    }

    /// Files with no verified data and no allocated bytes. Their logical length
    /// may already be the full file size because the engine pre-extends selected
    /// files, so length alone cannot identify them.
    pub(super) fn empty_placeholder_paths(
        &self,
        id: usize,
        save_dir: Option<&str>,
    ) -> Vec<PathBuf> {
        let (Some(save_dir), Some(handle)) = (save_dir, self.torrent_handle(id)) else {
            return Vec::new();
        };
        if self.torrent_is_initializing(id) {
            return Vec::new();
        }
        let stats = handle.stats();
        let mut paths = Vec::new();
        let _ = handle.with_metadata(|metadata| {
            for (index, file) in metadata.file_infos.iter().enumerate() {
                if file.attrs.padding {
                    continue;
                }
                if stats.file_progress.get(index).copied().unwrap_or(0) > 0 {
                    continue;
                }
                if !is_safe_relative_path(&file.relative_filename.to_string_lossy()) {
                    continue;
                }
                let path = resolve_payload_path(&Path::new(save_dir).join(&file.relative_filename));
                if !std::fs::metadata(&path).is_ok_and(|meta| meta.is_file()) {
                    continue;
                }
                if disk::allocated_bytes(&path).is_some_and(|allocated| allocated == 0) {
                    paths.push(path);
                }
            }
        });
        paths
    }

    pub(super) fn partial_leftover_for(
        &self,
        id: usize,
        key: &str,
        save_dir: &str,
        name: &str,
    ) -> Option<PartialLeftover> {
        let handle = self.torrent_handle(id)?;
        let stats = handle.stats();
        let files: Vec<PartialLeftoverFile> = handle
            .with_metadata(|metadata| {
                metadata
                    .file_infos
                    .iter()
                    .enumerate()
                    .filter_map(|(index, file)| {
                        if !is_safe_relative_path(&file.relative_filename.to_string_lossy()) {
                            return None;
                        }
                        if file.attrs.padding {
                            return None;
                        }
                        let progress = stats.file_progress.get(index).copied().unwrap_or(0);
                        let final_path = Path::new(save_dir).join(&file.relative_filename);
                        let full_path = resolve_payload_path(&final_path);
                        if !std::fs::metadata(&full_path).is_ok_and(|meta| meta.is_file()) {
                            return None;
                        }
                        let is_part = full_path != final_path;
                        let complete = file.len == 0 || progress >= file.len;
                        // A finished payload at its final name is not a
                        // leftover. A finished `.part` twin still is: the
                        // rename was blocked, or this is an unselected file
                        // whose partial data the user chose to keep.
                        if complete && !is_part {
                            return None;
                        }
                        let allocated = disk::allocated_bytes(&full_path).unwrap_or(0);
                        // No verified and no allocated data: an engine placeholder.
                        if progress == 0 && allocated == 0 {
                            return None;
                        }
                        // The record names the file that exists, including a
                        // `.part` partial, so cleanup and later resumes find it.
                        let name = if is_part {
                            format!("{}.part", file.relative_filename.to_string_lossy())
                        } else {
                            file.relative_filename.to_string_lossy().to_string()
                        };
                        Some(PartialLeftoverFile {
                            name,
                            size: file.len,
                            on_disk_bytes: allocated.max(progress),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();
        if files.is_empty() {
            return None;
        }
        Some(PartialLeftover {
            info_hash: key.to_string(),
            name: name.to_string(),
            save_dir: save_dir.to_string(),
            files,
            removed_at: now_secs(),
        })
    }

    pub(super) fn prune_partial_leftovers(&self) {
        let before = self.registry.partial_leftovers.len();
        self.registry.partial_leftovers.retain(|_, leftover| {
            leftover.files.iter().any(|file| {
                Path::new(&leftover.save_dir)
                    .join(&file.name)
                    .metadata()
                    .is_ok_and(|meta| meta.is_file() && meta.len() > 0)
            })
        });
        if self.registry.partial_leftovers.len() != before {
            self.registry.save_partial_leftovers();
        }
    }

    pub(super) fn active_info_hashes(&self) -> HashSet<String> {
        self.session.with_torrents(|iter| {
            iter.map(|(_, handle)| handle.info_hash().as_string())
                .collect()
        })
    }

    pub fn list_partial_leftovers(&self) -> Vec<PartialLeftover> {
        self.prune_partial_leftovers();
        let active = self.active_info_hashes();
        let mut result: Vec<PartialLeftover> = self
            .registry
            .partial_leftovers
            .iter()
            .filter(|entry| !active.contains(entry.key()))
            .map(|entry| entry.value().clone())
            .collect();
        result.sort_by_key(|left| Reverse(left.removed_at));
        result
    }

    pub fn clear_partial_leftovers(&self, hashes: Option<&[String]>) -> u64 {
        let active = self.active_info_hashes();
        let keys: Vec<String> = self
            .registry
            .partial_leftovers
            .iter()
            .filter(|entry| !active.contains(entry.key()))
            .filter(|entry| hashes.is_none_or(|wanted| wanted.contains(entry.key())))
            .map(|entry| entry.key().clone())
            .collect();
        let mut freed = 0u64;
        for key in keys {
            let Some((_, leftover)) = self.registry.partial_leftovers.remove(&key) else {
                continue;
            };
            for file in &leftover.files {
                if !is_safe_relative_path(&file.name) {
                    continue;
                }
                let path = Path::new(&leftover.save_dir).join(&file.name);
                if !path.starts_with(&leftover.save_dir) {
                    continue;
                }
                let allocated = disk::allocated_bytes(&path).unwrap_or(file.on_disk_bytes);
                if std::fs::remove_file(&path).is_ok() {
                    freed = freed.saturating_add(allocated);
                }
                self.forget_hidden_path(&key, &path.to_string_lossy());
                remove_empty_parents(&path, Path::new(&leftover.save_dir));
            }
        }
        self.registry.save_partial_leftovers();
        self.registry.save_hidden_paths();
        freed
    }

    pub(super) fn prune_created_torrents(&self) {
        const KEEP: usize = 20;
        let Ok(entries) = std::fs::read_dir(&self.created_dir) else {
            return;
        };
        let mut files: Vec<(std::time::SystemTime, PathBuf)> = entries
            .flatten()
            .filter(|entry| entry.path().extension().is_some_and(|ext| ext == "torrent"))
            .filter_map(|entry| {
                let path = entry.path();
                let modified = entry.metadata().ok()?.modified().ok()?;
                Some((modified, path))
            })
            .collect();
        if files.len() <= KEEP {
            return;
        }
        files.sort_by_key(|entry| Reverse(entry.0));
        for (_, path) in files.into_iter().skip(KEEP) {
            let _ = std::fs::remove_file(path);
        }
    }
}
