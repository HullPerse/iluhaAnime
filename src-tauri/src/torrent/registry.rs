use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use dashmap::DashMap;

use super::helpers::{is_info_hash, is_valid_folder_name};
use super::types::{PartialLeftover, TorrentLimits, TorrentOrigin};

/// Owns the torrent sidecar maps and their JSON files.
///
/// The file names, filters, and serialized shapes are unchanged from the
/// manager. Keep them stable: a rename silently drops a user's aliases,
/// limits, or saved folders.
pub struct TorrentRegistry {
    pub save_dirs: DashMap<usize, String>,
    pub save_dirs_path: PathBuf,
    pub magnet_links: DashMap<usize, String>,
    pub magnet_links_path: PathBuf,
    pub aliases: DashMap<String, String>,
    pub aliases_path: PathBuf,
    pub root_names: DashMap<String, String>,
    pub root_names_path: PathBuf,
    pub torrent_sources: DashMap<String, TorrentOrigin>,
    pub torrent_sources_path: PathBuf,
    pub torrent_limits: DashMap<String, TorrentLimits>,
    pub torrent_limits_path: PathBuf,
    pub partial_leftovers: DashMap<String, PartialLeftover>,
    pub partial_leftovers_path: PathBuf,
    pub hidden_paths: DashMap<String, HashSet<String>>,
    pub hidden_paths_path: PathBuf,
    pub hidden_paths_lock: std::sync::Mutex<()>,
}

impl TorrentRegistry {
    pub fn load(app_data_dir: &Path) -> Self {
        let save_dirs_path = app_data_dir.join("save_dirs.json");
        let save_dirs: HashMap<usize, String> =
            read_json::<HashMap<usize, String>>(&save_dirs_path).unwrap_or_default();

        let magnet_links_path = app_data_dir.join("magnet_links.json");
        let magnet_links: HashMap<usize, String> =
            read_json::<HashMap<usize, String>>(&magnet_links_path).unwrap_or_default();

        let aliases_path = app_data_dir.join("torrent_aliases.json");
        let aliases: HashMap<String, String> = read_json::<HashMap<String, String>>(&aliases_path)
            .unwrap_or_default()
            .into_iter()
            .filter(|(key, value)| is_info_hash(key) && !value.trim().is_empty())
            .collect();

        let root_names_path = app_data_dir.join("torrent_root_names.json");
        let root_names: HashMap<String, String> =
            read_json::<HashMap<String, String>>(&root_names_path)
                .unwrap_or_default()
                .into_iter()
                .filter(|(key, value)| is_info_hash(key) && is_valid_folder_name(value))
                .collect();

        let torrent_limits_path = app_data_dir.join("torrent_limits.json");
        let torrent_limits: HashMap<String, TorrentLimits> =
            read_json::<HashMap<String, TorrentLimits>>(&torrent_limits_path)
                .unwrap_or_default()
                .into_iter()
                .filter(|(key, _)| is_info_hash(key))
                .collect();

        let torrent_sources_path = app_data_dir.join("torrent_sources.json");
        let torrent_sources: HashMap<String, TorrentOrigin> = read_json::<
            HashMap<String, TorrentOrigin>,
        >(&torrent_sources_path)
        .unwrap_or_default()
        .into_iter()
        .filter(|(key, value)| {
            is_info_hash(key) && !value.source.trim().is_empty() && !value.url.trim().is_empty()
        })
        .collect();

        let partial_leftovers_path = app_data_dir.join("partial_leftovers.json");
        let partial_leftovers: HashMap<String, PartialLeftover> =
            read_json::<HashMap<String, PartialLeftover>>(&partial_leftovers_path)
                .unwrap_or_default()
                .into_iter()
                .filter(|(key, value)| is_info_hash(key) && !value.files.is_empty())
                .collect();

        let hidden_paths_path = app_data_dir.join("hidden_files.json");
        let hidden_paths: HashMap<String, Vec<String>> =
            read_json::<HashMap<String, Vec<String>>>(&hidden_paths_path)
                .unwrap_or_default()
                .into_iter()
                .filter(|(key, paths)| is_info_hash(key) && !paths.is_empty())
                .collect();

        Self {
            save_dirs: save_dirs.into_iter().collect(),
            save_dirs_path,
            magnet_links: magnet_links.into_iter().collect(),
            magnet_links_path,
            aliases: aliases.into_iter().collect(),
            aliases_path,
            root_names: root_names.into_iter().collect(),
            root_names_path,
            torrent_sources: torrent_sources.into_iter().collect(),
            torrent_sources_path,
            torrent_limits: torrent_limits.into_iter().collect(),
            torrent_limits_path,
            partial_leftovers: partial_leftovers.into_iter().collect(),
            partial_leftovers_path,
            hidden_paths: hidden_paths
                .into_iter()
                .map(|(key, paths)| (key, paths.into_iter().collect()))
                .collect(),
            hidden_paths_path,
            hidden_paths_lock: std::sync::Mutex::new(()),
        }
    }

    pub fn save_save_dirs(&self) {
        let map: HashMap<usize, String> = self
            .save_dirs
            .iter()
            .map(|entry| (*entry.key(), entry.value().clone()))
            .collect();
        write_json(&self.save_dirs_path, &map);
    }

    pub fn save_magnet_links(&self) {
        let map: HashMap<usize, String> = self
            .magnet_links
            .iter()
            .map(|entry| (*entry.key(), entry.value().clone()))
            .collect();
        write_json(&self.magnet_links_path, &map);
    }

    pub fn save_aliases(&self) {
        let map: HashMap<String, String> = self
            .aliases
            .iter()
            .map(|entry| (entry.key().clone(), entry.value().clone()))
            .collect();
        write_json(&self.aliases_path, &map);
    }

    pub fn save_root_names(&self) {
        let map: HashMap<String, String> = self
            .root_names
            .iter()
            .map(|entry| (entry.key().clone(), entry.value().clone()))
            .collect();
        write_json(&self.root_names_path, &map);
    }

    pub fn save_torrent_sources(&self) {
        let map: HashMap<String, TorrentOrigin> = self
            .torrent_sources
            .iter()
            .map(|entry| (entry.key().clone(), entry.value().clone()))
            .collect();
        write_json(&self.torrent_sources_path, &map);
    }

    pub fn save_torrent_limits(&self) {
        let map: HashMap<String, TorrentLimits> = self
            .torrent_limits
            .iter()
            .map(|entry| (entry.key().clone(), *entry.value()))
            .collect();
        write_json(&self.torrent_limits_path, &map);
    }

    pub fn save_partial_leftovers(&self) {
        let map: HashMap<String, PartialLeftover> = self
            .partial_leftovers
            .iter()
            .map(|entry| (entry.key().clone(), entry.value().clone()))
            .collect();
        write_json(&self.partial_leftovers_path, &map);
    }

    pub fn save_hidden_paths(&self) {
        let _guard =
            crate::sync_utils::lock_or_recover(&self.hidden_paths_lock, "torrent hidden paths");
        let map: HashMap<String, Vec<String>> = self
            .hidden_paths
            .iter()
            .map(|entry| (entry.key().clone(), entry.value().iter().cloned().collect()))
            .collect();
        write_json(&self.hidden_paths_path, &map);
    }
}

fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> Option<T> {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|json| serde_json::from_str(&json).ok())
}

fn write_json<T: serde::Serialize>(path: &Path, value: &T) {
    if let Ok(json) = serde_json::to_string(value) {
        let _ = std::fs::write(path, json);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::torrent::types::PartialLeftoverFile;

    fn temp_dir(label: &str) -> PathBuf {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("clock before epoch")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!(
            "iluha-registry-{label}-{}-{stamp}",
            std::process::id()
        ));
        std::fs::create_dir_all(&dir).expect("create registry temp dir");
        dir
    }

    #[test]
    fn sidecars_round_trip_through_the_same_files() {
        let dir = temp_dir("roundtrip");
        let registry = TorrentRegistry::load(&dir);
        let hash = "a".repeat(40);
        registry.save_dirs.insert(7, "D:/downloads".into());
        registry
            .magnet_links
            .insert(7, "magnet:?xt=urn:btih:test".into());
        registry.aliases.insert(hash.clone(), "Alias".into());
        registry.root_names.insert(hash.clone(), "Show".into());
        registry.torrent_sources.insert(
            hash.clone(),
            TorrentOrigin {
                source: "nyaa".into(),
                url: "https://example.test/1".into(),
            },
        );
        registry.torrent_limits.insert(
            hash.clone(),
            TorrentLimits {
                download_bps: Some(10),
                upload_bps: None,
            },
        );
        registry.partial_leftovers.insert(
            hash.clone(),
            PartialLeftover {
                info_hash: hash.clone(),
                name: "Show".into(),
                save_dir: "D:/downloads".into(),
                files: vec![PartialLeftoverFile {
                    name: "Show/01.mkv".into(),
                    size: 10,
                    on_disk_bytes: 5,
                }],
                removed_at: 1,
            },
        );
        registry.hidden_paths.insert(
            hash.clone(),
            HashSet::from(["D:/downloads/Show/01.mkv".to_string()]),
        );

        registry.save_save_dirs();
        registry.save_magnet_links();
        registry.save_aliases();
        registry.save_root_names();
        registry.save_torrent_sources();
        registry.save_torrent_limits();
        registry.save_partial_leftovers();
        registry.save_hidden_paths();

        let loaded = TorrentRegistry::load(&dir);
        assert_eq!(
            loaded.save_dirs.get(&7).map(|entry| entry.value().clone()),
            Some("D:/downloads".to_string())
        );
        assert_eq!(
            loaded
                .magnet_links
                .get(&7)
                .map(|entry| entry.value().clone()),
            Some("magnet:?xt=urn:btih:test".to_string())
        );
        assert_eq!(
            loaded.aliases.get(&hash).map(|entry| entry.value().clone()),
            Some("Alias".to_string())
        );
        assert_eq!(
            loaded
                .root_names
                .get(&hash)
                .map(|entry| entry.value().clone()),
            Some("Show".to_string())
        );
        assert_eq!(
            loaded
                .torrent_sources
                .get(&hash)
                .map(|entry| entry.source.clone()),
            Some("nyaa".into())
        );
        assert_eq!(
            loaded.torrent_limits.get(&hash).map(|entry| *entry.value()),
            Some(TorrentLimits {
                download_bps: Some(10),
                upload_bps: None
            })
        );
        assert_eq!(
            loaded
                .partial_leftovers
                .get(&hash)
                .map(|entry| entry.files.len()),
            Some(1)
        );
        assert!(loaded.hidden_paths.contains_key(&hash));

        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn corrupt_sidecars_fall_back_to_empty_maps() {
        let dir = temp_dir("corrupt");
        std::fs::write(dir.join("save_dirs.json"), "{bad").expect("write corrupt save dirs");
        std::fs::write(dir.join("torrent_aliases.json"), "{bad").expect("write corrupt aliases");
        std::fs::write(dir.join("hidden_files.json"), "{bad").expect("write corrupt hidden");

        let registry = TorrentRegistry::load(&dir);
        assert!(registry.save_dirs.is_empty());
        assert!(registry.aliases.is_empty());
        assert!(registry.hidden_paths.is_empty());

        std::fs::remove_dir_all(dir).ok();
    }
}
