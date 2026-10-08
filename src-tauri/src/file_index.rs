use std::collections::HashSet;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct FileEntry {
    pub path: String,
    pub name: String,
    pub size: u64,
}

type FileIndex = Arc<RwLock<Vec<FileEntry>>>;

pub struct FileIndexer {
    index: FileIndex,
    rebuild_generation: AtomicU64,
}

impl FileIndexer {
    pub fn new() -> Self {
        Self {
            index: Arc::new(RwLock::new(Vec::new())),
            rebuild_generation: AtomicU64::new(0),
        }
    }

    pub(crate) const SCAN_BUSY_ATTEMPTS: u32 = 3;

    /// Single choke point for every blocking directory walk in the process.
    ///
    /// jwalk drives its parallel walk off the shared global rayon pool with a
    /// 1s startup handshake: N concurrent walks (one per saved folder plus an
    /// overlapping index rebuild) wedge the pool and every walk past the first
    /// fails with "rayon thread-pool too busy". Holding this guard across each
    /// walk keeps a single walk on the pool at a time; per-walk parallelism
    /// inside jwalk is kept.
    pub(crate) fn scan_slot() -> &'static std::sync::Mutex<()> {
        static SLOT: std::sync::OnceLock<std::sync::Mutex<()>> = std::sync::OnceLock::new();
        SLOT.get_or_init(|| std::sync::Mutex::new(()))
    }

    /// Runs a blocking directory walk, serialized and retrying the rayon busy
    /// case.
    ///
    /// By construction the walk closures below skip every IO problem and only
    /// fail with the jwalk busy error (shared rayon pool wedged past its 1s
    /// startup timeout, e.g. while torrent hashing saturates it), so an `Err`
    /// here always means "busy, try again".
    pub(crate) fn retry_scan_blocking<T>(
        mut run: impl FnMut() -> Result<T, String>,
    ) -> Result<T, String> {
        let _guard = Self::scan_slot()
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let mut attempt: u32 = 0;
        loop {
            match run() {
                Ok(value) => return Ok(value),
                Err(busy) if attempt + 1 < Self::SCAN_BUSY_ATTEMPTS => {
                    attempt += 1;
                    tracing::warn!(
                        "file scan hit a busy thread pool (attempt {attempt}): {busy}; retrying"
                    );
                    std::thread::sleep(std::time::Duration::from_millis(300 * u64::from(attempt)));
                }
                Err(busy) => return Err(busy),
            }
        }
    }

    fn walk_matching_entries(root: &str, ext_list: &[String]) -> Result<Vec<FileEntry>, String> {
        let mut entries = Vec::new();
        let mut skipped: u64 = 0;
        for entry in jwalk::WalkDir::new(root)
            .follow_links(false)
            .skip_hidden(true)
        {
            let entry = match entry {
                Ok(entry) => entry,
                Err(error) if error.is_busy() => return Err(format!("scan error: {error}")),
                Err(error) => {
                    skipped += 1;
                    tracing::warn!("file scan: skipping unreadable entry: {error}");
                    continue;
                }
            };
            if entry.file_type().is_dir() {
                continue;
            }

            let path = entry.path();
            let matches_extension = path
                .extension()
                .and_then(|extension| extension.to_str())
                .is_some_and(|extension| {
                    ext_list
                        .iter()
                        .any(|known| extension.eq_ignore_ascii_case(known))
                });
            if !matches_extension {
                continue;
            }

            let name = path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            let size = match std::fs::metadata(&path) {
                Ok(meta) => meta.len(),
                Err(error) => {
                    skipped += 1;
                    tracing::warn!(
                        "file scan: skipping unreadable file {}: {error}",
                        path.to_string_lossy()
                    );
                    continue;
                }
            };
            entries.push(FileEntry {
                path: path.to_string_lossy().to_string(),
                name,
                size,
            });
        }
        if skipped > 0 {
            tracing::warn!("file scan: skipped {skipped} unreadable entries in {root}");
        }

        Ok(entries)
    }

    fn scan_paths(paths: Vec<String>, extensions: Vec<String>) -> Result<Vec<FileEntry>, String> {
        let ext_list: Vec<String> = extensions
            .into_iter()
            .map(|extension| extension.trim_start_matches('.').to_string())
            .filter(|extension| !extension.is_empty())
            .collect();
        let mut entries = Vec::new();

        for root in paths {
            match Self::retry_scan_blocking(|| Self::walk_matching_entries(&root, &ext_list)) {
                Ok(mut root_entries) => entries.append(&mut root_entries),
                Err(busy) => {
                    tracing::error!("file scan: giving up on {root} after retries: {busy}");
                }
            }
        }

        Ok(entries)
    }

    pub async fn rebuild(&self, paths: Vec<String>, extensions: Vec<String>) -> Result<(), String> {
        let generation = self.rebuild_generation.fetch_add(1, Ordering::AcqRel) + 1;
        let index = self.index.clone();
        let entries = tokio::task::spawn_blocking(move || Self::scan_paths(paths, extensions))
            .await
            .map_err(|e| format!("index task failed: {e}"))??;

        if self.rebuild_generation.load(Ordering::Acquire) != generation {
            return Ok(());
        }

        let mut current = index.write().await;
        *current = entries;
        drop(current);
        Ok(())
    }

    pub async fn refresh(
        &self,
        changed_roots: Vec<String>,
        extensions: Vec<String>,
    ) -> Result<(), String> {
        if changed_roots.is_empty() {
            return Ok(());
        }
        let generation = self.rebuild_generation.fetch_add(1, Ordering::AcqRel) + 1;
        let index = self.index.clone();
        let scan_roots = changed_roots.clone();
        let entries = tokio::task::spawn_blocking(move || Self::scan_paths(scan_roots, extensions))
            .await
            .map_err(|e| format!("incremental index task failed: {e}"))??;

        if self.rebuild_generation.load(Ordering::Acquire) != generation {
            return Ok(());
        }

        let roots: Vec<_> = changed_roots.iter().map(Path::new).collect();
        let mut current = index.write().await;
        current.retain(|entry| {
            !roots
                .iter()
                .any(|root| Path::new(&entry.path).starts_with(root))
        });
        current.extend(entries);
        drop(current);
        Ok(())
    }

    pub async fn snapshot(&self) -> Vec<FileEntry> {
        self.index.read().await.clone()
    }

    pub async fn search(&self, query: &str, extensions: &[String], limit: usize) -> Vec<FileEntry> {
        let query = query.trim().to_lowercase();
        let ext_set: HashSet<String> = extensions
            .iter()
            .map(|extension| extension.trim_start_matches('.').to_lowercase())
            .filter(|extension| !extension.is_empty())
            .collect();
        let limit = limit.min(500);

        let index = self.index.read().await;
        let mut results: Vec<(i32, &FileEntry)> = index
            .iter()
            .filter(|entry| {
                ext_set.is_empty()
                    || entry
                        .path
                        .rsplit_once('.')
                        .is_some_and(|(_, extension)| ext_set.contains(&extension.to_lowercase()))
            })
            .filter_map(|entry| {
                let name = entry.name.to_lowercase();
                let score = fuzzy_file_score(&query, &name)?;
                Some((score, entry))
            })
            .collect();

        results.sort_by_key(|(score, _)| std::cmp::Reverse(*score));
        results.truncate(limit);
        let owned: Vec<FileEntry> = results
            .into_iter()
            .map(|(_, entry)| entry.clone())
            .collect();
        drop(index);
        owned
    }
}

fn substring_score(query: &str, target: &str) -> Option<i32> {
    if query.is_empty() {
        return Some(0);
    }

    let position = target.find(query)?;
    let mut score = 1000;
    if position == 0 {
        score += 500;
    }
    if position > 0 && target[..position].ends_with(' ') {
        score += 200;
    }
    Some(score)
}
fn levenshtein_capped(a: &[char], b: &[char], cap: usize) -> Option<usize> {
    if a.len().abs_diff(b.len()) > cap {
        return None;
    }
    let mut prev: Vec<usize> = (0..=b.len()).collect();
    let mut curr = vec![0; b.len() + 1];
    for (i, &ac) in a.iter().enumerate() {
        curr[0] = i + 1;
        let mut row_min = curr[0];
        for (j, &bc) in b.iter().enumerate() {
            let cost = usize::from(ac != bc);
            curr[j + 1] = (prev[j] + cost).min(prev[j + 1] + 1).min(curr[j] + 1);
            row_min = row_min.min(curr[j + 1]);
        }
        if row_min > cap {
            return None;
        }
        std::mem::swap(&mut prev, &mut curr);
    }
    let distance = prev[b.len()];
    (distance <= cap).then_some(distance)
}
fn fuzzy_file_score(query: &str, target: &str) -> Option<i32> {
    if let Some(score) = substring_score(query, target) {
        return Some(score);
    }
    let query_chars: Vec<char> = query.chars().collect();
    if query_chars.len() < 3 {
        return None;
    }
    let threshold = (query_chars.len() / 4).clamp(1, 3);
    let stem = target.rsplit_once('.').map_or(target, |(stem, _)| stem);
    let mut best: Option<usize> = None;
    let mut consider = |text: &str| {
        let chars: Vec<char> = text.chars().collect();
        if let Some(distance) = levenshtein_capped(&query_chars, &chars, threshold) {
            best = Some(best.map_or(distance, |known| known.min(distance)));
        }
    };
    consider(stem);
    for token in stem.split(|c: char| !c.is_alphanumeric()) {
        if !token.is_empty() {
            consider(token);
        }
    }
    best.map(|distance| 600 - distance as i32 * 150)
}

#[cfg(test)]
mod tests {
    use super::FileIndexer;
    use super::{fuzzy_file_score, substring_score};
    use std::sync::atomic::{AtomicU64, Ordering};

    static FIXTURE_COUNTER: AtomicU64 = AtomicU64::new(0);

    fn fixture_root(tag: &str) -> std::path::PathBuf {
        let id = FIXTURE_COUNTER.fetch_add(1, Ordering::SeqCst);
        std::env::temp_dir().join(format!(
            "iluha_scan_test_{}_{}_{id}",
            std::process::id(),
            tag
        ))
    }

    fn write_tree(root: &std::path::Path) {
        for dir in ["Season 1", "Season 2"] {
            let dir_path = root.join(dir);
            std::fs::create_dir_all(&dir_path).expect("fixture dir");
            for file in 0..10 {
                std::fs::write(dir_path.join(format!("ep{file:02}.mkv")), b"x")
                    .expect("fixture video");
            }
            std::fs::write(dir_path.join("notes.nfo"), b"x").expect("fixture notes");
        }
        std::fs::write(root.join("movie.MP4"), b"x").expect("fixture movie");
    }

    fn ext_list() -> Vec<String> {
        ["mkv", "mp4"].into_iter().map(str::to_string).collect()
    }

    fn remove_fixture(root: &std::path::Path) {
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn scores_prefix_matches_higher() {
        assert!(substring_score("cat", "cat video") > substring_score("cat", "a cat video"));
    }

    #[test]
    fn handles_unicode_without_slicing_a_character() {
        assert_eq!(substring_score("ан", "тест ан"), Some(1200));
    }
    #[test]
    fn typo_matches_word_with_single_deletion() {
        assert_eq!(fuzzy_file_score("friren", "frieren s01e01.mkv"), Some(450));
    }
    #[test]
    fn typo_scores_below_substring_match() {
        let typo = fuzzy_file_score("friren", "frieren s01e01.mkv");
        let exact = substring_score("frieren", "frieren s01e01.mkv");
        assert!(typo < exact);
    }
    #[test]
    fn rejects_distant_and_short_queries() {
        assert_eq!(fuzzy_file_score("xyz", "frieren.mkv"), None);
        assert_eq!(fuzzy_file_score("ab", "xb"), None);
    }

    #[test]
    fn retry_returns_after_scripted_busy_failures() {
        let mut calls = 0;
        let result = FileIndexer::retry_scan_blocking(|| {
            calls += 1;
            if calls < 3 {
                Err("scan error: rayon thread-pool too busy".to_string())
            } else {
                Ok(calls)
            }
        });
        assert_eq!(result, Ok(3));
        assert_eq!(calls, 3);
    }

    #[test]
    fn retry_gives_up_after_max_attempts() {
        let mut calls = 0;
        let result = FileIndexer::retry_scan_blocking(|| {
            calls += 1;
            Err::<(), _>("scan error: rayon thread-pool too busy".to_string())
        });
        assert!(result.is_err());
        assert_eq!(calls, FileIndexer::SCAN_BUSY_ATTEMPTS as usize);
    }

    #[test]
    fn walk_matches_video_case_insensitively_and_skips_notes() {
        let root = fixture_root("walk");
        write_tree(&root);
        let entries = FileIndexer::retry_scan_blocking(|| {
            FileIndexer::walk_matching_entries(&root.to_string_lossy(), &ext_list())
        })
        .expect("walk should succeed");
        remove_fixture(&root);
        // 2 dirs x 10 mkv + 1 uppercase MP4; the .nfo files are skipped.
        assert_eq!(entries.len(), 21);
        assert!(entries.iter().any(|entry| entry.name == "movie.MP4"));
    }

    #[test]
    fn walk_on_missing_root_resolves_empty_instead_of_failing() {
        let missing = fixture_root("missing").join("nope");
        let entries = FileIndexer::retry_scan_blocking(|| {
            FileIndexer::walk_matching_entries(&missing.to_string_lossy(), &ext_list())
        })
        .expect("missing root must not fail the scan");
        assert!(entries.is_empty());
    }

    #[test]
    fn scan_paths_aggregates_roots_and_skips_missing_ones() {
        let root = fixture_root("multi");
        write_tree(&root);
        let missing = fixture_root("multi-missing").join("nope");
        let entries = FileIndexer::scan_paths(
            vec![
                root.to_string_lossy().to_string(),
                missing.to_string_lossy().to_string(),
            ],
            vec!["mkv".to_string(), "mp4".to_string()],
        )
        .expect("multi-root scan should succeed");
        remove_fixture(&root);
        assert_eq!(entries.len(), 21);
    }

    #[test]
    fn concurrent_walks_all_succeed_without_busy_errors() {
        let root = fixture_root("concurrent");
        write_tree(&root);
        let root_string = root.to_string_lossy().to_string();
        let handles: Vec<_> = (0..8)
            .map(|_| {
                let root = root_string.clone();
                std::thread::spawn(move || {
                    FileIndexer::retry_scan_blocking(|| {
                        FileIndexer::walk_matching_entries(&root, &ext_list())
                    })
                })
            })
            .collect();
        let mut total = 0;
        for handle in handles {
            let entries = handle
                .join()
                .expect("scan thread")
                .expect("scan should succeed");
            assert_eq!(entries.len(), 21);
            total += entries.len();
        }
        remove_fixture(&root);
        assert_eq!(total, 8 * 21);
    }
}
