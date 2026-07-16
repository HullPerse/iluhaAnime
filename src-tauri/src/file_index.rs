use std::collections::HashSet;
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
}

impl FileIndexer {
    pub fn new() -> Self {
        Self {
            index: Arc::new(RwLock::new(Vec::new())),
        }
    }

    pub async fn rebuild(&self, paths: Vec<String>, extensions: Vec<String>) -> Result<(), String> {
        let ext_set: HashSet<String> = extensions.into_iter().map(|e| e.to_lowercase()).collect();

        let mut entries = Vec::new();

        for root in &paths {
            for entry in walkdir::WalkDir::new(root).follow_links(true) {
                let entry = entry.map_err(|e| format!("walkdir error: {e}"))?;
                if entry.file_type().is_dir() {
                    continue;
                }
                let path = entry.path();
                if let Some(ext) = path.extension() {
                    if ext_set.contains(&ext.to_string_lossy().to_lowercase()) {
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
            }
        }

        let mut index = self.index.write().await;
        *index = entries;
        Ok(())
    }

    pub async fn search(&self, query: &str, extensions: &[String], limit: usize) -> Vec<FileEntry> {
        let index = self.index.read().await;
        let q = query.to_lowercase();
        let ext_set: HashSet<String> = extensions.iter().map(|e| e.to_lowercase()).collect();

        let mut results: Vec<(i32, &FileEntry)> = index
            .iter()
            .filter(|e| {
                ext_set.is_empty()
                    || e.path
                        .split('.')
                        .last()
                        .map(|ext| ext_set.contains(&ext.to_lowercase()))
                        .unwrap_or(false)
            })
            .filter_map(|e| {
                let lower = e.name.to_lowercase();
                let score = substring_score(&q, &lower)?;
                Some((score, e))
            })
            .collect();

        results.sort_by(|a, b| b.0.cmp(&a.0));
        results.truncate(limit);
        results.into_iter().map(|(_, e)| e.clone()).collect()
    }
}

fn substring_score(query: &str, target: &str) -> Option<i32> {
    if query.is_empty() {
        return Some(0);
    }
    let pos = target.to_lowercase().find(&query.to_lowercase())?;
    let mut score = 1000;
    if pos == 0 {
        score += 500;
    }
    if pos > 0 && target.as_bytes()[pos - 1] == b' ' {
        score += 200;
    }
    Some(score)
}
