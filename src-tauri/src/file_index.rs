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

    fn scan_paths(paths: Vec<String>, extensions: Vec<String>) -> Result<Vec<FileEntry>, String> {
        let ext_set: HashSet<String> = extensions
            .into_iter()
            .map(|extension| extension.trim_start_matches('.').to_lowercase())
            .filter(|extension| !extension.is_empty())
            .collect();
        let mut entries = Vec::new();

        for root in paths {
            for entry in walkdir::WalkDir::new(root).follow_links(false) {
                let entry = entry.map_err(|e| format!("walkdir error: {e}"))?;
                if entry.file_type().is_dir() {
                    continue;
                }

                let path = entry.path();
                let matches_extension = path
                    .extension()
                    .and_then(|extension| extension.to_str())
                    .is_some_and(|extension| ext_set.contains(&extension.to_lowercase()));
                if !matches_extension {
                    continue;
                }

                let name = path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();
                let size = std::fs::metadata(path)
                    .map_err(|e| format!("metadata error: {e}"))?
                    .len();
                entries.push(FileEntry {
                    path: path.to_string_lossy().to_string(),
                    name,
                    size,
                });
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
        Ok(())
    }

    pub async fn snapshot(&self) -> Vec<FileEntry> {
        self.index.read().await.clone()
    }

    pub async fn search(&self, query: &str, extensions: &[String], limit: usize) -> Vec<FileEntry> {
        let index = self.index.read().await;
        let query = query.trim().to_lowercase();
        let ext_set: HashSet<String> = extensions
            .iter()
            .map(|extension| extension.trim_start_matches('.').to_lowercase())
            .filter(|extension| !extension.is_empty())
            .collect();
        let limit = limit.min(500);

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
        results
            .into_iter()
            .map(|(_, entry)| entry.clone())
            .collect()
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
    use super::{fuzzy_file_score, substring_score};

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
}
