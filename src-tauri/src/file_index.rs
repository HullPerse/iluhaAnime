use std::collections::HashSet;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use tokio::sync::RwLock;

/// One indexed file.
///
/// The index is filled by a walk and then only ever read, so the entry keeps
/// its strings boxed (no spare capacity to grow into) and stores the search
/// key in the case the matcher needs instead of lowercasing every name on
/// every keystroke. `name` is derived from `path` when the entry is serialized
/// for the frontend rather than stored twice.
#[derive(Clone, Debug)]
pub struct FileEntry {
    pub path: Box<str>,
    name_lower: Box<str>,
    pub size: u64,
}

impl FileEntry {
    #[must_use]
    pub fn new(path: impl Into<String>, size: u64) -> Self {
        let path = path.into();
        let name_lower = file_name(&path).to_lowercase();
        Self {
            path: path.into_boxed_str(),
            name_lower: name_lower.into_boxed_str(),
            size,
        }
    }

    /// The file name the UI shows, derived from the path.
    #[must_use]
    pub fn name(&self) -> &str {
        file_name(&self.path)
    }

    /// The name the fuzzy matcher scores against, lowercased once at index
    /// build time.
    #[must_use]
    pub fn name_lower(&self) -> &str {
        &self.name_lower
    }
}

impl serde::Serialize for FileEntry {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut entry = serializer.serialize_struct("FileEntry", 3)?;
        entry.serialize_field("path", &self.path)?;
        entry.serialize_field("name", self.name())?;
        entry.serialize_field("size", &self.size)?;
        entry.end()
    }
}

/// The last component of an indexed path, without touching the filesystem.
fn file_name(path: &str) -> &str {
    path.rsplit(['/', '\\']).next().unwrap_or(path)
}

/// Case-insensitive extension membership without lowercasing the extension
/// into a fresh `String` for every indexed file on every search.
fn extension_in(set: &HashSet<String>, extension: &str) -> bool {
    if extension.is_ascii() {
        return set
            .iter()
            .any(|known| known.eq_ignore_ascii_case(extension));
    }
    set.contains(&extension.to_lowercase())
}

/// Compares a path with a key built by [`index_key`] without building a second
/// key: a watcher batch walks the whole index, and a temporary string per
/// entry per batch is the single largest allocation there.
fn matches_index_key(path: &str, key: &str) -> bool {
    let mut path_chars = path.chars().flat_map(char::to_lowercase).map(|character| {
        if character == '\\' {
            '/'
        } else {
            character
        }
    });
    let mut key_chars = key.chars();
    loop {
        match (path_chars.next(), key_chars.next()) {
            (None, None) => return true,
            (Some(left), Some(right)) if left == right => {}
            _ => return false,
        }
    }
}

type FileIndex = Arc<RwLock<Vec<FileEntry>>>;

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct FileQuery {
    pub text: String,
    pub extensions: Vec<String>,
    pub excluded_extensions: Vec<String>,
    pub excludes: Vec<String>,
}

/// Case- and separator-insensitive key for path equality. The watcher reports
/// native Windows paths while the index stores whatever jwalk produced, so a
/// plain `==` would miss entries for the same file.
fn index_key(path: &str) -> String {
    path.replace('\\', "/").to_lowercase()
}

/// Reads one path as an index entry, or `None` when it is gone, unreadable, a
/// directory, or not one of `ext_list` (already lowercased, no dot).
fn file_entry_at(path: &str, ext_list: &[String]) -> Option<FileEntry> {
    let matches_extension = Path::new(path)
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            ext_list
                .iter()
                .any(|known| extension.eq_ignore_ascii_case(known))
        });
    if !matches_extension {
        return None;
    }
    let meta = std::fs::metadata(path).ok()?;
    if !meta.is_file() {
        return None;
    }
    Some(FileEntry::new(path, meta.len()))
}

fn clean_extension(raw: &str) -> Option<String> {
    let cleaned = raw.trim().trim_start_matches('.').to_lowercase();
    (!cleaned.is_empty()).then_some(cleaned)
}

fn push_glob_extensions(into: &mut Vec<String>, glob: &str) {
    let stripped = glob.trim().trim_start_matches('{').trim_end_matches('}');
    for part in stripped.split(',') {
        if let Some(extension) = clean_extension(part) {
            into.push(extension);
        }
    }
}

/// Splits `*.ext`, `ext:a,b` and `!token` constraints out of a file query.
///
/// Everything else stays search text; scoring is untouched.
#[must_use]
pub fn parse_file_query(raw: &str) -> FileQuery {
    let mut query = FileQuery::default();
    let mut text_parts = Vec::new();
    for token in raw.split_whitespace() {
        if let Some(negated) = token.strip_prefix('!') {
            if negated.is_empty() {
                continue;
            }
            if let Some(glob) = negated.strip_prefix("*.") {
                push_glob_extensions(&mut query.excluded_extensions, glob);
                continue;
            }
            let exclude = negated.trim_matches('/').to_lowercase();
            if !exclude.is_empty() {
                query.excludes.push(exclude);
            }
            continue;
        }
        if let Some(glob) = token.strip_prefix("*.") {
            push_glob_extensions(&mut query.extensions, glob);
            continue;
        }
        if let Some(list) = token.strip_prefix("ext:") {
            push_glob_extensions(&mut query.extensions, list);
            continue;
        }
        text_parts.push(token);
    }
    query.text = text_parts.join(" ");
    query
}

pub struct FileIndexer {
    index: FileIndex,
    rebuild_generation: AtomicU64,
}

impl Default for FileIndexer {
    fn default() -> Self {
        Self::new()
    }
}

impl FileIndexer {
    #[must_use]
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
        static SLOT: OnceLock<Mutex<()>> = OnceLock::new();
        SLOT.get_or_init(|| Mutex::new(()))
    }

    /// `0` means "one thread per logical core"; an explicit value is clamped to
    /// `2..=64` so a hand-edited store cannot ask for thousands of threads, and
    /// a walk always keeps at least one free thread for its own tasks.
    #[must_use]
    pub(crate) fn normalize_scan_threads(threads: usize) -> usize {
        if threads == 0 {
            std::thread::available_parallelism()
                .map_or(4, std::num::NonZeroUsize::get)
                .clamp(2, 64)
        } else {
            threads.clamp(2, 64)
        }
    }

    /// The parallelism every directory walk in the process shares.
    ///
    /// jwalk's default pool is the process-wide rayon pool that torrent hashing
    /// also drives: when hashing saturates it, a walk aborts after a 1s
    /// handshake ("rayon thread-pool too busy"). Walks get a pool of their own
    /// instead, sized from the `scanThreads` setting, so hashing can no longer
    /// starve them and a big scan cannot starve hashing. The pool is rebuilt
    /// only when the requested size changes.
    pub(crate) fn scan_parallelism(threads: usize) -> jwalk::Parallelism {
        type Slot = OnceLock<Mutex<Option<(usize, Arc<rayon::ThreadPool>)>>>;
        static POOL: Slot = OnceLock::new();
        let requested = Self::normalize_scan_threads(threads);
        let slot = POOL.get_or_init(|| Mutex::new(None));
        {
            let current = crate::sync_utils::lock_or_recover(slot, "file scan thread pool");
            if let Some((size, pool)) = current.as_ref() {
                if *size == requested {
                    return jwalk::Parallelism::RayonExistingPool {
                        pool: Arc::clone(pool),
                        // A walk is driven from a blocking thread, never from
                        // the pool itself, so a busy pool delays it instead of
                        // deadlocking it and the handshake check buys nothing.
                        busy_timeout: None,
                    };
                }
            }
        }
        // Built with the guard released: spawning the threads while holding it
        // would stall every other walk for the whole build.
        match rayon::ThreadPoolBuilder::new()
            .num_threads(requested)
            .thread_name(|index| format!("scan-{index}"))
            .build()
        {
            Ok(pool) => {
                let pool = Arc::new(pool);
                let mut current = crate::sync_utils::lock_or_recover(slot, "file scan thread pool");
                *current = Some((requested, Arc::clone(&pool)));
                drop(current);
                jwalk::Parallelism::RayonExistingPool {
                    pool,
                    busy_timeout: None,
                }
            }
            Err(error) => {
                tracing::warn!(
                    "scan pool unavailable ({error}); falling back to the shared rayon pool"
                );
                jwalk::Parallelism::RayonDefaultPool {
                    busy_timeout: std::time::Duration::from_secs(5),
                }
            }
        }
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
        let _guard = Self::scan_slot().lock().unwrap_or_else(|poisoned| {
            tracing::warn!("file scan slot mutex was poisoned; recovering");
            poisoned.into_inner()
        });
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

    fn walk_matching_entries(
        root: &str,
        ext_list: &[String],
        threads: usize,
    ) -> Result<Vec<FileEntry>, String> {
        let mut entries = Vec::with_capacity(1024);
        let mut skipped: u64 = 0;
        for entry in jwalk::WalkDir::new(root)
            .follow_links(false)
            .skip_hidden(true)
            .parallelism(Self::scan_parallelism(threads))
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
            entries.push(FileEntry::new(path.to_string_lossy().as_ref(), size));
        }
        if skipped > 0 {
            tracing::warn!("file scan: skipped {skipped} unreadable entries in {root}");
        }

        Ok(entries)
    }

    fn scan_paths(
        paths: Vec<String>,
        extensions: Vec<String>,
        threads: usize,
    ) -> Result<Vec<FileEntry>, String> {
        let ext_list: Vec<String> = extensions
            .into_iter()
            .map(|extension| extension.trim_start_matches('.').to_string())
            .filter(|extension| !extension.is_empty())
            .collect();
        let mut entries = Vec::with_capacity(1024);

        for root in paths {
            match Self::retry_scan_blocking(|| {
                Self::walk_matching_entries(&root, &ext_list, threads)
            }) {
                Ok(mut root_entries) => entries.append(&mut root_entries),
                Err(busy) => {
                    tracing::error!("file scan: giving up on {root} after retries: {busy}");
                }
            }
        }

        Ok(entries)
    }

    /// Replaces the whole index with a fresh walk of `paths`.
    ///
    /// # Errors
    ///
    /// Fails when the blocking walk task cannot be spawned, or when a walk
    /// keeps hitting a busy thread pool after the built-in retries.
    pub async fn rebuild(
        &self,
        paths: Vec<String>,
        extensions: Vec<String>,
        threads: usize,
    ) -> Result<(), String> {
        let generation = self.rebuild_generation.fetch_add(1, Ordering::AcqRel) + 1;
        let index = self.index.clone();
        let mut entries =
            tokio::task::spawn_blocking(move || Self::scan_paths(paths, extensions, threads))
                .await
                .map_err(|e| format!("index task failed: {e}"))??;

        if self.rebuild_generation.load(Ordering::Acquire) != generation {
            return Ok(());
        }

        // The walk grows its vector by doubling; the index lives as long as
        // the app, so the spare capacity is returned instead of kept.
        entries.shrink_to_fit();
        let mut current = index.write().await;
        *current = entries;
        drop(current);
        Ok(())
    }

    /// Rescans `changed_roots`, swaps their slice of the index and returns the
    /// freshly scanned entries so the caller can reuse them (the folder tree)
    /// instead of walking the same roots a second time.
    ///
    /// When a newer rebuild or point update superseded this walk, the index
    /// keeps the newer data but the walk result is still returned: an empty
    /// answer would drop the folder tree and empty the live playlist for a
    /// folder that is still there.
    ///
    /// # Errors
    ///
    /// Fails when the blocking walk task cannot be spawned, or when a walk
    /// keeps hitting a busy thread pool after the built-in retries.
    pub async fn refresh(
        &self,
        changed_roots: Vec<String>,
        extensions: Vec<String>,
        threads: usize,
    ) -> Result<Vec<FileEntry>, String> {
        if changed_roots.is_empty() {
            return Ok(Vec::new());
        }
        let generation = self.rebuild_generation.fetch_add(1, Ordering::AcqRel) + 1;
        let index = self.index.clone();
        let scan_roots = changed_roots.clone();
        let entries =
            tokio::task::spawn_blocking(move || Self::scan_paths(scan_roots, extensions, threads))
                .await
                .map_err(|e| format!("incremental index task failed: {e}"))??;

        if self.rebuild_generation.load(Ordering::Acquire) != generation {
            tracing::debug!(
                "file index refresh superseded; keeping the newer index and returning the walk"
            );
            return Ok(entries);
        }

        let roots: Vec<_> = changed_roots.iter().map(Path::new).collect();
        let mut current = index.write().await;
        current.retain(|entry| {
            !roots
                .iter()
                .any(|root| Path::new(entry.path.as_ref()).starts_with(root))
        });
        current.extend(entries.iter().cloned());
        drop(current);
        Ok(entries)
    }

    /// Point update for a watched folder: `upserts` are re-read from disk and
    /// `removals` are dropped, without walking any root. Returns the upserts
    /// that qualified, so the caller can patch its tree with the authoritative
    /// name and size instead of stat-ing the file again.
    ///
    /// An upsert that no longer qualifies (deleted in the window, renamed to a
    /// non-video extension) still drops the stale entry it may have left.
    pub async fn apply_paths(
        &self,
        upserts: Vec<String>,
        removals: Vec<String>,
        extensions: Vec<String>,
    ) -> Vec<FileEntry> {
        if upserts.is_empty() && removals.is_empty() {
            return Vec::new();
        }
        let ext_list: Vec<String> = extensions
            .into_iter()
            .map(|extension| extension.trim_start_matches('.').to_lowercase())
            .filter(|extension| !extension.is_empty())
            .collect();
        let generation = self.rebuild_generation.fetch_add(1, Ordering::AcqRel) + 1;
        let touched: Vec<String> = removals
            .iter()
            .chain(upserts.iter())
            .map(|path| index_key(path))
            .collect();
        let fresh: Vec<FileEntry> = upserts
            .iter()
            .filter_map(|path| file_entry_at(path, &ext_list))
            .collect();

        if self.rebuild_generation.load(Ordering::Acquire) != generation {
            return Vec::new();
        }
        let mut current = self.index.write().await;
        current.retain(|entry| {
            !touched
                .iter()
                .any(|key| matches_index_key(&entry.path, key))
        });
        current.extend(fresh.iter().cloned());
        drop(current);
        fresh
    }

    pub async fn snapshot(&self) -> Vec<FileEntry> {
        self.index.read().await.clone()
    }

    pub async fn search(&self, query: &str, extensions: &[String], limit: usize) -> Vec<FileEntry> {
        let parsed = parse_file_query(query);
        let text = parsed.text.trim().to_lowercase();
        let mut ext_set: HashSet<String> = extensions
            .iter()
            .filter_map(|extension| clean_extension(extension))
            .collect();
        ext_set.extend(parsed.extensions);
        let excluded_ext: HashSet<String> = parsed.excluded_extensions.into_iter().collect();
        let limit = limit.min(500);

        let mut scratch = SearchScratch::new(&text);
        let index = self.index.read().await;
        let mut results: Vec<(i32, &FileEntry)> = index
            .iter()
            .filter(|entry| {
                if !parsed.excludes.is_empty()
                    && parsed
                        .excludes
                        .iter()
                        .any(|exclude| entry.path.to_lowercase().contains(exclude))
                {
                    return false;
                }
                match entry.path.rsplit_once('.') {
                    Some((_, extension)) => {
                        if extension_in(&excluded_ext, extension) {
                            return false;
                        }
                        ext_set.is_empty() || extension_in(&ext_set, extension)
                    }
                    None => ext_set.is_empty(),
                }
            })
            .filter_map(|entry| {
                let score = fuzzy_file_score(&text, entry.name_lower(), &mut scratch)?;
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
fn levenshtein_capped(
    a: &[char],
    b: &[char],
    cap: usize,
    prev: &mut Vec<usize>,
    curr: &mut Vec<usize>,
) -> Option<usize> {
    if a.len().abs_diff(b.len()) > cap {
        return None;
    }
    prev.clear();
    prev.extend(0..=b.len());
    curr.clear();
    curr.resize(b.len() + 1, 0);
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
        std::mem::swap(prev, curr);
    }
    let distance = prev[b.len()];
    (distance <= cap).then_some(distance)
}

/// Buffers one search reuses across every entry.
///
/// A search scores the whole index, so a fresh `Vec<char>` per name and two
/// more per distance calculation turned one keystroke into tens of thousands
/// of allocations. The buffers are cleared, never reallocated.
pub struct SearchScratch {
    query_chars: Vec<char>,
    target_chars: Vec<char>,
    prev: Vec<usize>,
    curr: Vec<usize>,
}

impl SearchScratch {
    fn new(query: &str) -> Self {
        Self {
            query_chars: query.chars().collect(),
            target_chars: Vec::new(),
            prev: Vec::new(),
            curr: Vec::new(),
        }
    }

    fn distance_to(&mut self, text: &str, cap: usize) -> Option<usize> {
        self.target_chars.clear();
        self.target_chars.extend(text.chars());
        let Self {
            query_chars,
            target_chars,
            prev,
            curr,
        } = self;
        levenshtein_capped(query_chars, target_chars, cap, prev, curr)
    }
}

fn fuzzy_file_score(query: &str, target: &str, scratch: &mut SearchScratch) -> Option<i32> {
    if let Some(score) = substring_score(query, target) {
        return Some(score);
    }
    if scratch.query_chars.len() < 3 {
        return None;
    }
    let threshold = (scratch.query_chars.len() / 4).clamp(1, 3);
    let stem = target.rsplit_once('.').map_or(target, |(stem, _)| stem);
    let mut best: Option<usize> = None;
    let consider = |text: &str, best: &mut Option<usize>, scratch: &mut SearchScratch| {
        if let Some(distance) = scratch.distance_to(text, threshold) {
            *best = Some(best.map_or(distance, |known| known.min(distance)));
        }
    };
    consider(stem, &mut best, scratch);
    for token in stem.split(|c: char| !c.is_alphanumeric()) {
        if !token.is_empty() {
            consider(token, &mut best, scratch);
        }
    }
    best.map(|distance| 600 - distance as i32 * 150)
}

#[cfg(test)]
mod tests {
    use super::FileIndexer;
    use super::{fuzzy_file_score, index_key, parse_file_query, substring_score, SearchScratch};
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
    fn fuzzy(query: &str, target: &str) -> Option<i32> {
        fuzzy_file_score(query, target, &mut SearchScratch::new(query))
    }

    #[test]
    fn typo_matches_word_with_single_deletion() {
        assert_eq!(fuzzy("friren", "frieren s01e01.mkv"), Some(450));
    }
    #[test]
    fn typo_scores_below_substring_match() {
        let typo = fuzzy("friren", "frieren s01e01.mkv");
        let exact = substring_score("frieren", "frieren s01e01.mkv");
        assert!(typo < exact);
    }
    #[test]
    fn rejects_distant_and_short_queries() {
        assert_eq!(fuzzy("xyz", "frieren.mkv"), None);
        assert_eq!(fuzzy("ab", "xb"), None);
    }

    /// One scratch shared across a whole index must score exactly like a fresh
    /// one per call: the buffers are reused, the answers are not.
    #[test]
    fn reused_scratch_scores_like_a_fresh_one() {
        let names = [
            "frieren s01e01.mkv",
            "bocchi the rock - 04.mkv",
            "некоторые русские имена.mkv",
            "[SubsPlease] Show - 12 [1080p].mkv",
        ];
        let mut shared = SearchScratch::new("friren");
        for name in names {
            assert_eq!(
                fuzzy_file_score("friren", name, &mut shared),
                fuzzy("friren", name),
                "{name}"
            );
        }
        let mut empty = SearchScratch::new("");
        assert_eq!(fuzzy_file_score("", names[0], &mut empty), Some(0));
    }

    /// Watcher batches compare paths against keys without materializing a key
    /// per index entry, so the comparison has to keep Windows' case and
    /// separator insensitivity.
    #[test]
    fn index_key_comparison_matches_the_key_builder() {
        let path = "D:\\Anime\\Frieren\\S01E01.MKV";
        let key = index_key(path);
        assert!(super::matches_index_key(path, &key));
        assert!(super::matches_index_key(
            "d:/anime/frieren/s01e01.mkv",
            &key
        ));
        assert!(!super::matches_index_key(
            "D:\\Anime\\Frieren\\S01E02.MKV",
            &key
        ));
        assert!(!super::matches_index_key(path, &index_key("D:\\Anime")));
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
    fn scan_threads_default_to_cores_and_clamp_to_a_sane_range() {
        let cores = FileIndexer::normalize_scan_threads(0);
        assert!((2..=64).contains(&cores));
        assert_eq!(FileIndexer::normalize_scan_threads(1), 2);
        assert_eq!(FileIndexer::normalize_scan_threads(6), 6);
        assert_eq!(FileIndexer::normalize_scan_threads(10_000), 64);
    }

    /// Walks must run on the dedicated scan pool, sized as asked, instead of the
    /// process-wide rayon pool that torrent hashing shares.
    #[test]
    fn scan_parallelism_uses_a_dedicated_pool_of_the_requested_size() {
        let pool_of = |parallelism: jwalk::Parallelism| match parallelism {
            jwalk::Parallelism::RayonExistingPool { pool, .. } => pool,
            jwalk::Parallelism::Serial | jwalk::Parallelism::RayonDefaultPool { .. } => {
                panic!("expected a dedicated scan pool")
            }
            jwalk::Parallelism::RayonNewPool(_) => panic!("expected a pooled walk"),
        };
        assert_eq!(
            pool_of(FileIndexer::scan_parallelism(3)).current_num_threads(),
            3
        );
        assert_eq!(
            pool_of(FileIndexer::scan_parallelism(6)).current_num_threads(),
            6
        );
    }

    #[test]
    fn walk_matches_video_case_insensitively_and_skips_notes() {
        let root = fixture_root("walk");
        write_tree(&root);
        let entries = FileIndexer::retry_scan_blocking(|| {
            FileIndexer::walk_matching_entries(&root.to_string_lossy(), &ext_list(), 0)
        })
        .expect("walk should succeed");
        remove_fixture(&root);
        // 2 dirs x 10 mkv + 1 uppercase MP4; the .nfo files are skipped.
        assert_eq!(entries.len(), 21);
        assert!(entries.iter().any(|entry| entry.name() == "movie.MP4"));
    }

    #[test]
    fn walk_on_missing_root_resolves_empty_instead_of_failing() {
        let missing = fixture_root("missing").join("nope");
        let entries = FileIndexer::retry_scan_blocking(|| {
            FileIndexer::walk_matching_entries(&missing.to_string_lossy(), &ext_list(), 0)
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
            0,
        )
        .expect("multi-root scan should succeed");
        remove_fixture(&root);
        assert_eq!(entries.len(), 21);
    }

    #[test]
    fn apply_paths_updates_single_entries_without_walking_the_root() {
        let root = fixture_root("apply");
        write_tree(&root);
        let runtime = tokio::runtime::Runtime::new().expect("test runtime");
        let indexer = FileIndexer::new();
        runtime
            .block_on(indexer.rebuild(vec![root.to_string_lossy().to_string()], ext_list(), 0))
            .expect("rebuild");
        assert_eq!(runtime.block_on(indexer.snapshot()).len(), 21);

        // A finished download: one new episode appears next to the old ones.
        let added = root.join("episode.mkv");
        std::fs::write(&added, b"hello").expect("fixture add");
        let added_path = added.to_string_lossy().to_string();
        let fresh =
            runtime.block_on(indexer.apply_paths(vec![added_path.clone()], Vec::new(), ext_list()));
        assert_eq!(fresh.len(), 1);
        assert_eq!(fresh[0].size, 5);
        assert_eq!(fresh[0].name(), "episode.mkv");
        let after = runtime.block_on(indexer.snapshot());
        assert_eq!(after.len(), 22);
        assert_eq!(
            after
                .iter()
                .filter(|entry| index_key(&entry.path) == index_key(&added_path))
                .count(),
            1
        );

        // Removing it again drops exactly that entry.
        runtime.block_on(indexer.apply_paths(Vec::new(), vec![added_path], ext_list()));
        assert_eq!(runtime.block_on(indexer.snapshot()).len(), 21);

        // An upsert that is gone by the time we stat it must not resurrect a row.
        let vanished = root.join("vanished.mkv").to_string_lossy().to_string();
        runtime.block_on(indexer.apply_paths(vec![vanished], Vec::new(), ext_list()));
        assert_eq!(runtime.block_on(indexer.snapshot()).len(), 21);
        remove_fixture(&root);
    }

    /// A point update landing mid-walk supersedes it: the index keeps the
    /// newer state, but the walk result must still be handed back instead of
    /// an empty list (that would drop the folder tree and empty the playlist).
    #[tokio::test]
    async fn refresh_returns_its_walk_when_a_point_update_supersedes_it() {
        let root = fixture_root("supersede");
        write_tree(&root);
        let indexer = FileIndexer::new();
        let mut refresh =
            Box::pin(indexer.refresh(vec![root.to_string_lossy().to_string()], ext_list(), 0));

        // Drive the refresh up to its blocking walk: the generation is bumped.
        assert!(futures::poll!(&mut refresh).is_pending());

        // A point update arrives while that walk is in flight. It does not
        // touch the disk, so the walk below still sees the 21 fixture files.
        indexer
            .apply_paths(
                vec![root.join("ghost.mkv").to_string_lossy().to_string()],
                Vec::new(),
                ext_list(),
            )
            .await;

        let entries = refresh.await.expect("refresh must resolve");
        assert_eq!(entries.len(), 21);
        remove_fixture(&root);
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
                        FileIndexer::walk_matching_entries(&root, &ext_list(), 4)
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

    #[test]
    fn query_parser_keeps_plain_text_untouched() {
        let parsed = parse_file_query("frieren s01e01");
        assert_eq!(parsed.text, "frieren s01e01");
        assert!(parsed.extensions.is_empty());
        assert!(parsed.excluded_extensions.is_empty());
        assert!(parsed.excludes.is_empty());
    }

    #[test]
    fn query_parser_extracts_globs_ext_lists_and_excludes() {
        let parsed = parse_file_query("*.mkv !sample/ ext:mp4,avi show");
        assert_eq!(parsed.text, "show");
        assert_eq!(parsed.extensions, vec!["mkv", "mp4", "avi"]);
        assert_eq!(parsed.excludes, vec!["sample"]);
    }

    #[test]
    fn query_parser_expands_braces_and_extension_excludes() {
        let parsed = parse_file_query("*.{mkv,mp4} !*.srt");
        assert_eq!(parsed.text, "");
        assert_eq!(parsed.extensions, vec!["mkv", "mp4"]);
        assert_eq!(parsed.excluded_extensions, vec!["srt"]);
    }

    #[test]
    fn query_parser_ignores_lone_markers() {
        let parsed = parse_file_query("! *. show");
        assert_eq!(parsed.text, "show");
        assert!(parsed.extensions.is_empty());
        assert!(parsed.excludes.is_empty());
    }

    #[test]
    fn query_parser_leaves_empty_query_empty() {
        let parsed = parse_file_query("   ");
        assert_eq!(parsed.text, "");
        assert!(parsed.extensions.is_empty());
        assert!(parsed.excludes.is_empty());
    }

    fn test_runtime() -> tokio::runtime::Runtime {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("test runtime")
    }

    fn memory_indexer(entries: &[(&str, &str)]) -> FileIndexer {
        let indexer = FileIndexer::new();
        test_runtime().block_on(async {
            let mut index = indexer.index.write().await;
            *index = entries
                .iter()
                .map(|(path, _name)| super::FileEntry::new(*path, 1))
                .collect();
        });
        indexer
    }

    fn search_blocking(
        indexer: &FileIndexer,
        query: &str,
        extensions: &[String],
    ) -> Vec<super::FileEntry> {
        test_runtime().block_on(indexer.search(query, extensions, 50))
    }

    #[test]
    fn search_drops_paths_matching_an_exclude_token() {
        let indexer = memory_indexer(&[
            ("/lib/Show/ep01.mkv", "ep01.mkv"),
            ("/lib/Show/sample/ep01.mkv", "ep01.mkv"),
        ]);
        let hits = search_blocking(&indexer, "ep01 !sample/", &[]);
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].path.as_ref(), "/lib/Show/ep01.mkv");
    }

    #[test]
    fn search_inline_glob_narrows_extensions() {
        let indexer = memory_indexer(&[
            ("/lib/Show/ep01.mkv", "ep01.mkv"),
            ("/lib/Show/notes.nfo", "notes.nfo"),
        ]);
        let hits = search_blocking(&indexer, "*.mkv ep01", &[]);
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].path.as_ref(), "/lib/Show/ep01.mkv");
    }

    #[test]
    fn search_excluded_extension_drops_nfo() {
        let indexer = memory_indexer(&[
            ("/lib/Show/ep01.mkv", "ep01.mkv"),
            ("/lib/Show/ep01.nfo", "ep01.nfo"),
        ]);
        let hits = search_blocking(&indexer, "ep01 !*.nfo", &[]);
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].path.as_ref(), "/lib/Show/ep01.mkv");
    }

    /// Per-keystroke cost of a search over a large library index, and the
    /// per-entry cost of one watcher batch updating it.
    #[test]
    fn search_and_watcher_budget() {
        use crate::mem_layout::counting::measure;

        let entries: Vec<super::FileEntry> = (0..10_000)
            .map(|index| {
                super::FileEntry::new(
                    format!(
                        "D:/Anime/Show {:03}/Season {}/[SubsPlease] Show {:03} - {:02} [1080p].mkv",
                        index % 120,
                        index % 12 + 1,
                        index % 120,
                        index % 48 + 1
                    ),
                    1,
                )
            })
            .collect();
        let indexer = FileIndexer::new();
        test_runtime().block_on(async {
            let mut index = indexer.index.write().await;
            *index = entries.clone();
        });

        let _warm = search_blocking(&indexer, "show 012", &[]);
        let (hits, search) = measure(|| search_blocking(&indexer, "show 012", &[]));
        println!(
            "search(10k): allocs={} bytes={} live={} hits={}",
            search.allocs,
            search.bytes,
            search.live_bytes,
            hits.len()
        );

        let names: Vec<&str> = entries.iter().map(super::FileEntry::name).collect();
        let started = std::time::Instant::now();
        for _ in 0..20 {
            for name in &names {
                std::hint::black_box(name.to_lowercase());
            }
        }
        println!(
            "lowercase every name(10k, removed from search): {:.2}ms",
            started.elapsed().as_secs_f64() * 1_000.0 / 20.0
        );

        let started = std::time::Instant::now();
        for _ in 0..20 {
            std::hint::black_box(search_blocking(&indexer, "show 012", &[]));
        }
        println!(
            "search(10k): {:.2}ms per query",
            started.elapsed().as_secs_f64() * 1_000.0 / 20.0
        );

        let touched: Vec<String> = (0..8)
            .map(|index| super::index_key(&entries[index].path))
            .collect();
        let (kept, watcher) = measure(|| {
            entries
                .iter()
                .filter(|entry| {
                    !touched
                        .iter()
                        .any(|key| super::matches_index_key(&entry.path, key))
                })
                .count()
        });
        println!(
            "watcher retain(10k): allocs={} bytes={} kept={}",
            watcher.allocs, watcher.bytes, kept
        );
        assert!(hits.len() <= 50);
        // Only the returned entries are copied: one query over the whole index
        // used to allocate per scanned file (names, extensions, distance
        // buffers).
        assert!(
            search.allocs < 500,
            "search allocates {} times per query",
            search.allocs
        );
        assert!(
            watcher.allocs < 16,
            "retain allocates {} times per batch",
            watcher.allocs
        );
    }

    /// The frontend reads `path`, `name` and `size` off every entry; the name
    /// is derived at serialization time rather than stored.
    #[test]
    fn serializes_the_derived_name_for_the_frontend() {
        let entry = super::FileEntry::new("D:/Anime/Frieren/S01E01.mkv", 42);
        let json = serde_json::to_value(&entry).expect("entry should serialize");
        assert_eq!(json["path"], "D:/Anime/Frieren/S01E01.mkv");
        assert_eq!(json["name"], "S01E01.mkv");
        assert_eq!(json["size"], 42);
    }

    #[test]
    fn search_unions_inline_and_parameter_extensions() {
        let indexer = memory_indexer(&[
            ("/lib/Show/ep01.mkv", "ep01.mkv"),
            ("/lib/Show/movie.mp4", "movie.mp4"),
            ("/lib/Show/notes.nfo", "notes.nfo"),
        ]);
        let hits = search_blocking(&indexer, "ext:mp4 e", &["mkv".to_string()]);
        let names: Vec<_> = hits.iter().map(super::FileEntry::name).collect();
        assert!(names.contains(&"ep01.mkv"));
        assert!(names.contains(&"movie.mp4"));
        assert!(!names.contains(&"notes.nfo"));
    }
}
