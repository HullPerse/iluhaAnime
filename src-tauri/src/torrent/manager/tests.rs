use super::super::helpers::{
    is_safe_relative_path, with_fallback_trackers, with_fallback_trackers_bytes,
};
use super::super::types::FilePriority;
use super::*;
use librqbit::{create_torrent, torrent_from_bytes, CreateTorrentOptions};

#[test]
fn utp_listener_is_enabled_only_without_a_proxy() {
    assert!(session_listener_mode(false).tcp_enabled());
    assert!(session_listener_mode(false).utp_enabled());
    assert!(session_listener_mode(true).tcp_enabled());
    assert!(!session_listener_mode(true).utp_enabled());
}

#[tokio::test(flavor = "multi_thread")]
async fn diagnostics_rejects_unknown_id() {
    let dir = std::env::temp_dir().join(format!("iluha-diag-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("create temp dir");
    let manager = TorrentManager::new_test(dir).await.expect("manager");
    let error = manager
        .torrent_diagnostics(999, None)
        .expect_err("unknown id");
    assert_eq!(error, "torrent not found");
}
#[test]
fn is_safe_relative_path_rejects_absolute_and_traversal_paths() {
    assert!(!is_safe_relative_path(""));
    assert!(!is_safe_relative_path("/tmp/video.mkv"));
    assert!(!is_safe_relative_path("../video.mkv"));
    assert!(!is_safe_relative_path("folder/../video.mkv"));
}

#[test]
fn is_safe_relative_path_accepts_normal_nested_paths() {
    assert!(is_safe_relative_path("Season 1/video.mkv"));
}

#[test]
fn dir_has_entry_finds_nested_payloads() {
    let root = std::env::temp_dir().join(format!(
        "iluha_dir_has_entry_{}_{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("clock")
            .as_nanos()
    ));
    let nested = root.join("Season 02");
    std::fs::create_dir_all(&nested).expect("create nested dir");
    let present = nested.join("Episode 01.mkv");
    std::fs::write(&present, b"x").expect("write payload");
    let missing = nested.join("Episode 02.mkv");

    let mut cache = HashMap::new();
    assert!(dir_has_entry(&mut cache, &present));
    assert!(!dir_has_entry(&mut cache, &missing));

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn share_ratio_is_safe_for_zero_downloads() {
    assert_eq!(share_ratio(100, 0), 0.0);
    assert_eq!(share_ratio(500, 1000), 0.5);
    assert_eq!(share_ratio(2500, 1000), 2.5);
}

#[test]
fn torrent_preferences_round_trip_through_json() {
    let hash = "0123456789abcdef0123456789abcdef01234567".to_string();
    let preferences = TorrentPreferences {
        sequential_torrents: HashSet::from([hash.clone()]),
        file_priorities: HashMap::from([(
            hash.clone(),
            vec![FilePriority::Normal, FilePriority::DoNotDownload],
        )]),
        download_order: HashMap::from([(hash.clone(), vec![2, 0])]),
    };
    let json = serde_json::to_string(&preferences).expect("preferences serialize");
    let restored: TorrentPreferences =
        serde_json::from_str(&json).expect("preferences deserialize");
    assert!(restored.sequential_torrents.contains(&hash));
    assert_eq!(
        restored.file_priorities.get(&hash),
        Some(&vec![FilePriority::Normal, FilePriority::DoNotDownload])
    );
    assert_eq!(restored.download_order.get(&hash), Some(&vec![2, 0]));
}

#[test]
fn a_preferences_file_without_a_queue_still_loads() {
    let json = r#"{"sequential_torrents":["0123456789abcdef0123456789abcdef01234567"],"file_priorities":{}}"#;
    let restored: TorrentPreferences = serde_json::from_str(json).expect("preferences deserialize");
    assert!(restored.download_order.is_empty());
    assert_eq!(restored.sequential_torrents.len(), 1);
}

#[test]
fn preferences_keyed_by_id_like_values_are_ignored() {
    let legacy = r#"{"sequential_torrents":[0,3],"file_priorities":{"3":["normal"]}}"#;
    let parsed: Result<TorrentPreferences, _> = serde_json::from_str(legacy);
    assert!(parsed.is_err(), "an id-keyed list must not silently load");
}

#[test]
fn with_fallback_trackers_encodes_and_appends() {
    let magnet = "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567";
    let augmented = with_fallback_trackers(magnet);
    assert!(augmented.starts_with(magnet));
    assert!(augmented.contains("tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce"));
    let with_tr = format!("{magnet}&tr=http%3A%2F%2Fbt.example%2Fann");
    let augmented_tr = with_fallback_trackers(&with_tr);
    assert!(augmented_tr.contains("tr=http%3A%2F%2Fbt.example%2Fann"));
    assert!(augmented_tr.contains("tracker.opentrackr.org"));
    assert!(augmented_tr.contains(magnet));
}

fn minimal_torrent_bytes() -> Vec<u8> {
    let mut bytes = Vec::new();
    bytes.extend_from_slice(b"d4:infod6:lengthi5e4:name4:file");
    bytes.extend_from_slice(b"12:piece lengthi32768e6:pieces20:");
    bytes.extend_from_slice(&[0u8; 20]);
    bytes.extend_from_slice(b"e8:announce13:udp://trackere");
    bytes
}

#[test]
fn torrent_bytes_get_fallback_trackers_and_keep_infohash() {
    let bytes = minimal_torrent_bytes();
    let augmented = with_fallback_trackers_bytes(&bytes);

    let parsed = torrent_from_bytes(&augmented).expect("augmented torrent parses");
    let trackers: HashSet<Vec<u8>> = parsed
        .announce_list
        .iter()
        .flatten()
        .map(|tracker| tracker.as_ref().to_vec())
        .collect();
    assert!(trackers.contains(b"udp://tracker".as_slice()));
    assert!(trackers.contains(b"udp://tracker.opentrackr.org:1337/announce".as_slice()));
    assert_eq!(
        crate::bencode::extract_info_hash(&augmented).expect("infohash"),
        crate::bencode::extract_info_hash(&bytes).expect("infohash")
    );
}

#[test]
fn private_and_malformed_torrent_bytes_are_left_untouched() {
    let mut private = Vec::new();
    private.extend_from_slice(b"d4:infod6:lengthi5e4:name4:file");
    private.extend_from_slice(b"12:piece lengthi32768e6:pieces20:");
    private.extend_from_slice(&[0u8; 20]);
    private.extend_from_slice(b"7:privatei1ee8:announce13:udp://trackere");

    assert_eq!(with_fallback_trackers_bytes(&private), private);
    assert_eq!(
        with_fallback_trackers_bytes(b"not a torrent"),
        b"not a torrent".to_vec()
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn already_managed_magnet_returns_files_instantly() {
    let dir = std::env::temp_dir().join(format!("iluha-meta-fast-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("create temp dir");

    let manager = Arc::new(
        TorrentManager::new_test(dir.clone())
            .await
            .expect("session starts"),
    );
    let bytes = minimal_torrent_bytes();
    let save_dir = dir.to_string_lossy().to_string();
    manager
        .add_torrent_from_bytes(bytes.clone(), save_dir.clone(), None, None, false)
        .await
        .expect("add torrent");

    let info_hash = crate::bencode::extract_info_hash(&bytes).expect("infohash");
    let magnet = format!("magnet:?xt=urn:btih:{info_hash}&dn=file");

    let start = std::time::Instant::now();
    let result = manager
        .get_torrent_info(magnet, save_dir)
        .await
        .expect("fast path returns the file list");
    let elapsed = start.elapsed();
    assert!(
        elapsed.as_secs() < 2,
        "fast path must not hit the network, took {elapsed:?}"
    );
    assert_eq!(result.name, "file");
    assert_eq!(result.files.len(), 1);
    assert_eq!(result.files[0].name, "file");

    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test(flavor = "multi_thread")]
async fn metadata_resolution_times_out_without_peers() {
    let dir = std::env::temp_dir().join(format!("iluha-meta-timeout-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("create temp dir");

    let manager = Arc::new(
        TorrentManager::new_test(dir.clone())
            .await
            .expect("session starts"),
    );

    let magnet = format!(
        "magnet:?xt=urn:btih:{}&dn=no-such-torrent",
        "0123456789abcdef0123456789abcdef01234567"
    );
    let save_dir = dir.to_string_lossy().to_string();

    let result = tokio::time::timeout(
        std::time::Duration::from_secs(45),
        manager.get_torrent_info_inner_with_timeout(
            AddTorrent::from_url(magnet),
            save_dir,
            std::time::Duration::from_secs(10),
        ),
    )
    .await
    .expect("the bounded fetch must return within the hard bound");

    assert!(result.is_err(), "expected a timeout error, got {result:?}");
    let error = result.unwrap_err();
    assert!(error.contains("Timed out"), "unexpected error: {error}");

    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test(flavor = "multi_thread")]
async fn magnet_download_start_times_out_without_peers() {
    let dir = std::env::temp_dir().join(format!("iluha-add-timeout-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("create temp dir");

    let manager = Arc::new(
        TorrentManager::new_test(dir.clone())
            .await
            .expect("session starts"),
    );

    let magnet = format!(
        "magnet:?xt=urn:btih:{}&dn=no-such-torrent",
        "0123456789abcdef0123456789abcdef01234567"
    );
    let opts = AddTorrentOptions {
        output_folder: Some(dir.to_string_lossy().to_string()),
        overwrite: true,
        ..Default::default()
    };

    let result = tokio::time::timeout(
        std::time::Duration::from_secs(45),
        manager.add_torrent_with_timeout(
            AddTorrent::from_url(magnet),
            opts,
            std::time::Duration::from_secs(10),
        ),
    )
    .await
    .expect("the bounded add must return within the hard bound");

    let error = result.err().expect("expected a timeout error");
    let error = format!("{error:#}");
    assert!(error.contains("Timed out"), "unexpected error: {error}");

    let _ = std::fs::remove_dir_all(&dir);
}

fn test_info(id: usize, finished: bool, error: Option<&str>) -> TorrentInfo {
    TorrentInfo {
        id,
        name: format!("Torrent {id}"),
        info_hash: format!("hash-{id}"),
        total_bytes: 1000,
        progress_bytes: 0,
        uploaded_bytes: 0,
        share_ratio: 0.0,
        download_speed: 0.0,
        upload_speed: 0.0,
        peers_connected: 0,
        progress: 0.0,
        state: "live".to_string(),
        eta_secs: None,
        finished,
        error: error.map(str::to_string),
        save_dir: "/dl".to_string(),
        sequential_download: false,
        sequential_file: None,
        download_order: Vec::new(),
        missing_files: false,
        external_changes: false,
        external_changed_files: Vec::new(),
        checking_file: None,
        disk_sparse: Some(true),
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn verify_pending_missing_skips_downloading_torrents_and_respects_the_limit() {
    let dir = std::env::temp_dir().join(format!("iluha-verify-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("create temp dir");
    let manager = Arc::new(
        TorrentManager::new_test(dir.clone())
            .await
            .expect("session starts"),
    );

    let mut torrents = vec![
        test_info(1, false, None),
        test_info(2, true, None),
        test_info(3, true, None),
    ];
    manager.verify_pending_missing(&mut torrents, 1);

    assert!(
        !manager.missing_files.contains_key(&1),
        "an unfinished torrent is never checked: everything it still has to fetch would read as missing"
    );
    assert!(manager.missing_files.contains_key(&2));
    assert!(!manager.missing_files.contains_key(&3));
    assert!(!torrents[1].missing_files);
    assert!(!torrents[2].missing_files);

    manager.verify_pending_missing(&mut torrents, 5);
    assert!(
        manager.missing_files.contains_key(&3),
        "the next call picks up the rest"
    );
    let _ = std::fs::remove_dir_all(&dir);
}

fn create_test_torrent(label: &str, files: &[(&str, Vec<u8>)]) -> (Vec<u8>, PathBuf) {
    let dir =
        std::env::temp_dir().join(format!("iluha-torrent-src-{}-{label}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("create source dir");
    for (name, content) in files {
        let path = dir.join(name);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).expect("create nested dir");
        }
        std::fs::write(&path, content).expect("write source file");
    }
    let spawner = librqbit::spawn_utils::BlockingSpawner::new(1);
    let result = tokio::task::block_in_place(|| {
        futures::executor::block_on(create_torrent(
            &dir,
            CreateTorrentOptions {
                piece_length: Some(16 * 1024),
                ..Default::default()
            },
            &spawner,
        ))
    })
    .expect("create torrent");
    (result.as_bytes().expect("serialize torrent").to_vec(), dir)
}

#[tokio::test(flavor = "multi_thread")]
async fn create_torrent_from_folder_refuses_a_file_or_an_empty_folder() {
    let dir = std::env::temp_dir().join(format!("iluha-create-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("create temp dir");
    let manager = Arc::new(
        TorrentManager::new_test(dir.clone())
            .await
            .expect("session starts"),
    );

    let file = dir.join("movie.mkv");
    std::fs::write(&file, b"not a folder").expect("write file");
    let error = manager
        .create_torrent_from_folder(file.to_string_lossy().to_string())
        .await
        .expect_err("a single file is not a shareable folder");
    assert!(error.to_string().contains("folder"), "got: {error}");

    let empty = dir.join("Empty");
    std::fs::create_dir_all(&empty).expect("create empty dir");
    let error = manager
        .create_torrent_from_folder(empty.to_string_lossy().to_string())
        .await
        .expect_err("a folder with no files can never be seeded");
    assert!(error.to_string().contains("no files"), "got: {error}");

    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test(flavor = "multi_thread")]
async fn create_torrent_from_folder_seeds_the_folder_in_place() {
    let dir = std::env::temp_dir().join(format!("iluha-seed-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let source = dir.join("Show");
    std::fs::create_dir_all(source.join("nested")).expect("create source dir");
    std::fs::write(source.join("one.bin"), b"first").expect("write file");
    std::fs::write(source.join("nested").join("two.bin"), b"second").expect("write nested file");

    let manager = Arc::new(
        TorrentManager::new_test(dir.clone())
            .await
            .expect("session starts"),
    );
    let created = manager
        .create_torrent_from_folder(source.to_string_lossy().to_string())
        .await
        .expect("the folder becomes a seeded torrent");

    assert_eq!(created.name, "Show");
    assert_eq!(created.file_count, 2);
    assert_eq!(
        created.info_hash.len(),
        40,
        "an info hash is 20 bytes of hex"
    );

    let stored = std::fs::read(&created.torrent_path).expect("the metainfo copy is on disk");
    let parsed = torrent_from_bytes(&stored).expect("the stored copy parses");
    assert_eq!(parsed.info_hash.as_string(), created.info_hash);

    let seeded_from = manager
        .registry
        .save_dirs
        .get(&created.id)
        .map(|saved| saved.value().clone())
        .expect("the created torrent is in the session");
    assert_eq!(
        seeded_from,
        source.to_string_lossy().to_string(),
        "seeding has to read the folder itself, not its parent"
    );

    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(20);
    let mut info = None;
    while tokio::time::Instant::now() < deadline {
        info = manager
            .collect_torrents()
            .into_iter()
            .find(|torrent| torrent.id == created.id);
        if info.as_ref().is_some_and(|torrent| torrent.finished) {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(250)).await;
    }
    let info = info.expect("the created torrent shows up in the list");
    assert_eq!(info.name, "Show");
    assert_eq!(info.info_hash, created.info_hash);
    assert!(
        info.finished,
        "the files on disk have to be the payload, not something to download"
    );

    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test(flavor = "multi_thread")]
async fn torrent_file_add_reaches_live_state_with_file_list() {
    let dir = std::env::temp_dir().join(format!("iluha-torrent-add-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("create temp dir");

    #[allow(clippy::cast_sign_loss)]
    let content_a: Vec<u8> = (0..40 * 1024).map(|i| (i % 251) as u8).collect();
    #[allow(clippy::cast_sign_loss)]
    let content_b: Vec<u8> = (0..16 * 1024).map(|i| (i * 7 % 251) as u8).collect();
    let nested_name = Path::new("nested")
        .join("two.bin")
        .to_string_lossy()
        .to_string();
    let (torrent_bytes, source_dir) = create_test_torrent(
        "list",
        &[("one.bin", content_a), ("nested/two.bin", content_b)],
    );

    let manager = Arc::new(
        TorrentManager::new_test(dir.clone())
            .await
            .expect("session starts"),
    );
    let save_dir = dir.join("downloads").to_string_lossy().to_string();

    let info = manager
        .get_torrent_info_from_bytes(torrent_bytes.clone(), save_dir.clone())
        .await
        .expect("picker shows the file list for a torrent file");
    assert_eq!(info.files.len(), 2);
    let names: HashSet<&str> = info.files.iter().map(|f| f.name.as_str()).collect();
    assert_eq!(names.len(), 2);
    assert!(names.contains("one.bin"));
    assert!(names.contains(nested_name.as_str()));
    let one_index = info
        .files
        .iter()
        .find(|f| f.name == "one.bin")
        .expect("one.bin present")
        .index;
    let two_index = info
        .files
        .iter()
        .find(|f| f.name == nested_name)
        .expect("nested/two.bin present")
        .index;

    let id = manager
        .add_torrent_from_bytes(torrent_bytes.clone(), save_dir.clone(), None, None, false)
        .await
        .expect("torrent file adds");

    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(20);
    let mut state = String::new();
    while tokio::time::Instant::now() < deadline {
        state = manager
            .collect_torrents()
            .into_iter()
            .find(|t| t.id == id)
            .map(|t| t.state)
            .unwrap_or_default();
        if state == "live" {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(250)).await;
    }
    assert_eq!(state, "live", "torrent must leave initializing and go live");

    let files = manager
        .get_running_torrent_files(id)
        .expect("running torrent exposes its file list");
    assert_eq!(files.len(), 2);
    assert!(files.iter().all(|f| f.selected));
    assert!(files.iter().all(|f| f.priority == FilePriority::Normal));

    let id2 = manager
        .add_torrent_from_bytes(torrent_bytes, save_dir, Some(vec![one_index]), None, false)
        .await
        .expect("re-add with a subset updates the selection");
    assert_eq!(id2, id);
    let files = manager
        .get_running_torrent_files(id)
        .expect("running torrent exposes its updated file list");
    let one = files
        .iter()
        .find(|f| f.index == one_index)
        .expect("one.bin");
    let two = files
        .iter()
        .find(|f| f.index == two_index)
        .expect("nested/two.bin");
    assert!(one.selected);
    assert_eq!(one.priority, FilePriority::Normal);
    assert!(!two.selected);
    assert_eq!(two.priority, FilePriority::DoNotDownload);

    let _ = std::fs::remove_dir_all(&dir);
    let _ = std::fs::remove_dir_all(&source_dir);
}

#[tokio::test(flavor = "multi_thread")]
async fn sequential_add_starts_with_the_first_file_the_list_shows() {
    let dir = std::env::temp_dir().join(format!("iluha-sequential-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("create temp dir");

    #[allow(clippy::cast_sign_loss)]
    let content_a: Vec<u8> = (0..40 * 1024).map(|i| (i % 251) as u8).collect();
    #[allow(clippy::cast_sign_loss)]
    let content_b: Vec<u8> = (0..40 * 1024).map(|i| (i * 13 % 251) as u8).collect();
    let (torrent_bytes, source_dir) = create_test_torrent(
        "sequential",
        &[("Show - 02.mkv", content_a), ("Show - 01.mkv", content_b)],
    );

    let manager = Arc::new(
        TorrentManager::new_test(dir.clone())
            .await
            .expect("session starts"),
    );
    let save_dir = dir.join("downloads").to_string_lossy().to_string();

    let info = manager
        .get_torrent_info_from_bytes(torrent_bytes.clone(), save_dir.clone())
        .await
        .expect("file list");
    let first_index = info
        .files
        .iter()
        .find(|f| f.name == "Show - 01.mkv")
        .expect("Show - 01.mkv present")
        .index;

    let id = manager
        .add_torrent_from_bytes(torrent_bytes, save_dir, None, None, true)
        .await
        .expect("sequential add");

    for _ in 0..200 {
        let initializing = manager.torrent_handle(id).is_some_and(|handle| {
            matches!(handle.stats().state, TorrentStatsState::Initializing { .. })
        });
        if !initializing {
            break;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    manager.advance_sequential_torrents().await;

    let files = manager
        .get_running_torrent_files(id)
        .expect("running torrent exposes its file list");
    assert!(
        files.iter().all(|file| file.selected),
        "sequential mode is a nudge, not a selection: nothing the user picked is dropped \
         from the download, so no file is ever cancelled by it"
    );
    assert_eq!(
        manager.sequential_streams.get(&id).map(|holder| holder.0),
        Some(first_index),
        "the priority window opens on the first row the list shows, not the first index"
    );
    let hash = manager
        .collect_torrents()
        .into_iter()
        .find(|torrent| torrent.id == id)
        .expect("the torrent shows up in the list")
        .info_hash;
    assert!(
        manager.sequential_torrents.contains(&hash),
        "the mode is remembered by info hash, not by the session id"
    );
    assert!(
        !manager.torrent_is_paused(id),
        "the mode orders the download, it does not pause the torrent"
    );
    let listed = manager
        .collect_torrents()
        .into_iter()
        .find(|torrent| torrent.id == id)
        .expect("the torrent shows up in the list");
    assert!(listed.sequential_download);
    assert_eq!(
        listed.sequential_file,
        Some(first_index),
        "the list carries the file the mode is fetching first, which is what the UI marks"
    );
    assert_eq!(
        manager
            .file_priorities
            .get(&hash)
            .map(|entry| entry.iter().filter(|p| **p == FilePriority::Normal).count()),
        Some(2),
        "the mode must not turn the user's selection into a single file"
    );

    let _ = std::fs::remove_dir_all(&dir);
    let _ = std::fs::remove_dir_all(&source_dir);
}

#[tokio::test(flavor = "multi_thread")]
async fn the_download_order_is_keyed_by_info_hash_and_moves_the_window() {
    let dir = std::env::temp_dir().join(format!("iluha-queue-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("create temp dir");

    #[allow(clippy::cast_sign_loss)]
    let content: Vec<u8> = (0..40 * 1024).map(|i| (i % 251) as u8).collect();
    let (torrent_bytes, source_dir) = create_test_torrent(
        "queue",
        &[
            ("Show - 02.mkv", content.clone()),
            ("Show - 01.mkv", content.clone()),
            ("Show - 03.mkv", content),
        ],
    );

    let manager = Arc::new(
        TorrentManager::new_test(dir.clone())
            .await
            .expect("session starts"),
    );
    let save_dir = dir.join("downloads").to_string_lossy().to_string();
    let id = manager
        .add_torrent_from_bytes(torrent_bytes, save_dir, None, None, true)
        .await
        .expect("sequential add");
    wait_for_download_state(&manager, id).await;
    manager.advance_sequential_torrents().await;

    let files = manager.get_running_torrent_files(id).expect("file list");
    let index_of = |name: &str| {
        files
            .iter()
            .find(|file| file.name == name)
            .expect("file present")
            .index
    };
    let (first, second, third) = (
        index_of("Show - 01.mkv"),
        index_of("Show - 02.mkv"),
        index_of("Show - 03.mkv"),
    );
    let hash = manager
        .collect_torrents()
        .into_iter()
        .find(|torrent| torrent.id == id)
        .expect("torrent listed")
        .info_hash;

    assert_ne!(
        first, third,
        "the queue has to move the window for this test to prove anything"
    );
    assert_eq!(
        manager.sequential_streams.get(&id).map(|entry| entry.0),
        Some(first),
        "without an arrangement the mode takes the first row of the list"
    );

    manager
        .set_torrent_download_order(id, vec![third, 999, third], Some(hash.clone()))
        .await
        .expect("order saved");
    assert_eq!(
        manager.download_order.get(&hash).map(|entry| entry.clone()),
        Some(vec![third]),
        "the queue is stored under the info hash, cleaned of what cannot be fetched"
    );
    assert_eq!(
        manager.sequential_streams.get(&id).map(|entry| entry.0),
        Some(third),
        "the window moves to the queued file before the next tick"
    );
    assert_eq!(
        manager
            .collect_torrents()
            .into_iter()
            .find(|torrent| torrent.id == id)
            .expect("torrent listed")
            .download_order,
        vec![third],
        "the list carries the queue so the UI can show it"
    );

    assert_eq!(
        files.iter().filter(|file| file.selected).count(),
        3,
        "arranging the queue does not drop anything from the download"
    );
    assert_eq!(
        manager
            .sequential_plan(id, &manager.torrent_handle(id).expect("handle"))
            .expect("plan")
            .allowed,
        vec![third, first, second],
        "the queue comes first, the rest follows in the order the list shows"
    );

    manager
        .set_torrent_download_order(id, Vec::new(), Some(hash.clone()))
        .await
        .expect("order cleared");
    assert!(
        manager.download_order.get(&hash).is_none(),
        "an empty queue is cleared instead of stored"
    );
    assert_eq!(
        manager.sequential_streams.get(&id).map(|entry| entry.0),
        Some(first),
        "clearing it hands the torrent back to the global file order"
    );

    let _ = std::fs::remove_dir_all(&dir);
    let _ = std::fs::remove_dir_all(&source_dir);
}

async fn wait_for_download_state(manager: &Arc<TorrentManager>, id: usize) {
    for _ in 0..200 {
        let initializing = manager.torrent_handle(id).is_some_and(|handle| {
            matches!(handle.stats().state, TorrentStatsState::Initializing { .. })
        });
        if !initializing {
            return;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
}

async fn wait_for_files_on_disk(manager: &Arc<TorrentManager>, id: usize, save_dir: &Path) {
    for _ in 0..200 {
        let ready = manager
            .get_running_torrent_files(id)
            .map(|files| {
                !files.is_empty()
                    && files.iter().all(|file| {
                        std::fs::metadata(resolve_payload_path(&save_dir.join(&file.name)))
                            .map(|meta| meta.is_file() && meta.len() == file.size)
                            .unwrap_or(false)
                    })
            })
            .unwrap_or(false);
        if ready {
            return;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn switching_the_mode_off_only_closes_the_window() {
    let dir = std::env::temp_dir().join(format!("iluha-seq-off-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("create temp dir");

    #[allow(clippy::cast_sign_loss)]
    let content: Vec<u8> = (0..20 * 1024).map(|i| (i % 251) as u8).collect();
    let (torrent_bytes, source_dir) = create_test_torrent(
        "seq-off",
        &[("one.bin", content.clone()), ("two.bin", content)],
    );

    let manager = Arc::new(
        TorrentManager::new_test(dir.clone())
            .await
            .expect("session starts"),
    );
    let save_dir = dir.join("downloads").to_string_lossy().to_string();
    let id = manager
        .add_torrent_from_bytes(torrent_bytes, save_dir, None, None, false)
        .await
        .expect("torrent adds");
    wait_for_download_state(&manager, id).await;

    manager
        .set_sequential_download(id, true, None)
        .await
        .expect("mode on");
    assert!(manager.sequential_streams.contains_key(&id));

    manager
        .set_sequential_download(id, false, None)
        .await
        .expect("mode off");
    assert!(
        !manager.sequential_streams.contains_key(&id),
        "the priority window is closed when the mode goes off"
    );
    assert!(
        manager
            .get_running_torrent_files(id)
            .expect("file list")
            .iter()
            .all(|file| file.selected),
        "and the selection is still the user's own"
    );

    let _ = std::fs::remove_dir_all(&dir);
    let _ = std::fs::remove_dir_all(&source_dir);
}

#[tokio::test(flavor = "multi_thread")]
async fn marking_a_file_downloaded_keeps_the_other_selected_files() {
    let dir = std::env::temp_dir().join(format!("iluha-seq-prio-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("create temp dir");

    #[allow(clippy::cast_sign_loss)]
    let content: Vec<u8> = (0..20 * 1024).map(|i| (i % 251) as u8).collect();
    let (torrent_bytes, source_dir) = create_test_torrent(
        "seq-prio",
        &[("one.bin", content.clone()), ("two.bin", content)],
    );

    let manager = Arc::new(
        TorrentManager::new_test(dir.clone())
            .await
            .expect("session starts"),
    );
    let save_dir = dir.join("downloads").to_string_lossy().to_string();
    let id = manager
        .add_torrent_from_bytes(torrent_bytes, save_dir, None, None, false)
        .await
        .expect("torrent adds");
    wait_for_download_state(&manager, id).await;

    manager
        .set_file_priority(id, vec![0], FilePriority::Normal, None)
        .await
        .expect("priority accepted");
    assert!(
        manager
            .get_running_torrent_files(id)
            .expect("file list")
            .iter()
            .all(|file| file.selected),
        "allowing a file must not drop the files that were already allowed"
    );

    manager
        .set_file_priority(id, vec![0], FilePriority::DoNotDownload, None)
        .await
        .expect("priority accepted");
    let files = manager.get_running_torrent_files(id).expect("file list");
    assert_eq!(
        files
            .iter()
            .filter(|file| file.selected)
            .map(|file| file.index)
            .collect::<Vec<_>>(),
        vec![1],
        "turning one file off leaves the other ones on"
    );

    let _ = std::fs::remove_dir_all(&dir);
    let _ = std::fs::remove_dir_all(&source_dir);
}

async fn first_file_to_finish(
    manager: &Arc<TorrentManager>,
    id: usize,
    timeout: Duration,
) -> Option<usize> {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        let files = manager
            .get_running_torrent_files(id)
            .expect("the torrent keeps its file list while it downloads");
        let finished: Vec<usize> = files
            .iter()
            .filter(|file| file.completed)
            .map(|file| file.index)
            .collect();
        match finished.as_slice() {
            [index] => return Some(*index),
            [] => {}
            _ => return None,
        }
        tokio::time::sleep(Duration::from_millis(2)).await;
    }
    None
}

fn swarm_fixture(label: &str) -> (Vec<u8>, PathBuf, String, String) {
    const FILE_BYTES: usize = 4 * 1024 * 1024;
    #[allow(clippy::cast_sign_loss)]
    let content_a: Vec<u8> = (0..FILE_BYTES).map(|i| (i % 251) as u8).collect();
    #[allow(clippy::cast_sign_loss)]
    let content_b: Vec<u8> = (0..FILE_BYTES).map(|i| (i * 7 % 251) as u8).collect();
    let nested = Path::new("Season 02")
        .join("Show - 02.mkv")
        .to_string_lossy()
        .to_string();
    let (bytes, source_dir) = create_test_torrent(
        label,
        &[
            ("Show - 01.mkv", content_a),
            ("Season 02/Show - 02.mkv", content_b),
        ],
    );
    (bytes, source_dir, "Show - 01.mkv".to_string(), nested)
}

async fn start_local_seeder(
    dir: &Path,
    torrent_bytes: &[u8],
    source_dir: &Path,
) -> (Arc<Session>, std::net::SocketAddr) {
    let seeder = Session::new_with_opts(
        dir.join("seeder"),
        SessionOptions {
            dht: None,
            listen: Some(ListenerOptions {
                listen_addr: (Ipv4Addr::LOCALHOST, 0).into(),
                ..Default::default()
            }),
            disable_local_service_discovery: true,
            ..Default::default()
        },
    )
    .await
    .expect("seeder session starts");
    let addr = seeder.listen_addr().expect("seeder listens somewhere");
    seeder
        .add_torrent(
            AddTorrent::from_bytes(torrent_bytes.to_vec()),
            Some(AddTorrentOptions {
                output_folder: Some(source_dir.to_string_lossy().to_string()),
                overwrite: true,
                ..Default::default()
            }),
        )
        .await
        .expect("seeder adds the torrent");
    let holds_the_files = || {
        seeder.with_torrents(|iter| {
            for (_, handle) in iter {
                if handle.stats().finished {
                    return true;
                }
            }
            false
        })
    };
    let deadline = Instant::now() + Duration::from_secs(30);
    while Instant::now() < deadline && !holds_the_files() {
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    assert!(
        holds_the_files(),
        "the seeder has to hash the folder it already holds before it can serve anything"
    );
    (seeder, addr)
}

async fn download_from_local_seeder(
    manager: &Arc<TorrentManager>,
    torrent_bytes: Vec<u8>,
    dir: &Path,
    seeder_addr: std::net::SocketAddr,
    sequential: bool,
) -> usize {
    manager
        .peer_hints
        .lock()
        .expect("peer hints")
        .push(seeder_addr);
    let save_dir = dir.join("downloads").to_string_lossy().to_string();
    let id = manager
        .add_torrent_from_bytes(torrent_bytes, save_dir, None, None, sequential)
        .await
        .expect("torrent adds");
    wait_for_download_state(manager, id).await;
    if sequential {
        manager.advance_sequential_torrents().await;
    }
    id
}

fn swarm_file_indices(
    files: &[crate::torrent::types::TorrentFileInfo],
    root: &str,
    nested: &str,
) -> (usize, usize) {
    (
        files
            .iter()
            .find(|file| file.name == root)
            .expect("the root file is in the list")
            .index,
        files
            .iter()
            .find(|file| file.name == nested)
            .expect("the nested file is in the list")
            .index,
    )
}

#[tokio::test(flavor = "multi_thread")]
async fn sequential_mode_finishes_the_first_row_before_the_library_order() {
    let dir = std::env::temp_dir().join(format!("iluha-swarm-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("create temp dir");

    let (torrent_bytes, source_dir, root, nested) = swarm_fixture("swarm");
    let (_seeder, seeder_addr) = start_local_seeder(&dir, &torrent_bytes, &source_dir).await;
    let manager = Arc::new(
        TorrentManager::new_test(dir.join("leech"))
            .await
            .expect("session starts"),
    );
    let id = download_from_local_seeder(&manager, torrent_bytes, &dir, seeder_addr, true).await;

    let files = manager.get_running_torrent_files(id).expect("file list");
    let (target, other) = swarm_file_indices(&files, &root, &nested);
    assert_eq!(
        manager.sequential_streams.get(&id).map(|holder| holder.0),
        Some(target),
        "the mode has to be pointed at the root file before the download starts"
    );
    assert_eq!(
        first_file_to_finish(&manager, id, Duration::from_secs(90)).await,
        Some(target),
        "sequential mode has to finish the first row of the list; the library's own name \
         order takes the nested file instead (that one is index: {other})"
    );

    let _ = std::fs::remove_dir_all(&dir);
    let _ = std::fs::remove_dir_all(&source_dir);
}

#[tokio::test(flavor = "multi_thread")]
async fn without_the_mode_the_library_takes_the_nested_file_first() {
    let dir = std::env::temp_dir().join(format!("iluha-swarm-order-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("create temp dir");

    let (torrent_bytes, source_dir, root, nested) = swarm_fixture("swarm-order");
    let (_seeder, seeder_addr) = start_local_seeder(&dir, &torrent_bytes, &source_dir).await;
    let manager = Arc::new(
        TorrentManager::new_test(dir.join("leech"))
            .await
            .expect("session starts"),
    );
    let id = download_from_local_seeder(&manager, torrent_bytes, &dir, seeder_addr, false).await;

    let files = manager.get_running_torrent_files(id).expect("file list");
    let (target, other) = swarm_file_indices(&files, &root, &nested);
    assert!(
        manager.sequential_streams.get(&id).is_none(),
        "with the mode off nothing is prioritized"
    );
    assert_eq!(
        first_file_to_finish(&manager, id, Duration::from_secs(90)).await,
        Some(other),
        "the library queues files by name, so the nested one lands first - which is what the \
         sequential test is measured against (the root file is index: {target})"
    );

    let _ = std::fs::remove_dir_all(&dir);
    let _ = std::fs::remove_dir_all(&source_dir);
}

#[tokio::test(flavor = "multi_thread")]
async fn a_real_swarm_flags_external_edits_and_reverifies_on_resume() {
    let dir = std::env::temp_dir().join(format!("iluha-swarm-paused-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("create temp dir");

    let (torrent_bytes, source_dir, _root, _nested) = swarm_fixture("swarm-paused");
    let (_seeder, seeder_addr) = start_local_seeder(&dir, &torrent_bytes, &source_dir).await;
    let manager = Arc::new(
        TorrentManager::new_test(dir.join("leech"))
            .await
            .expect("session starts"),
    );
    let id = download_from_local_seeder(&manager, torrent_bytes, &dir, seeder_addr, false).await;

    let deadline = Instant::now() + Duration::from_secs(90);
    let is_finished = |manager: &Arc<TorrentManager>| {
        manager
            .collect_torrents()
            .iter()
            .any(|torrent| torrent.id == id && torrent.finished)
    };
    while Instant::now() < deadline && !is_finished(&manager) {
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    assert!(
        is_finished(&manager),
        "the leecher has to hold every byte before it is paused"
    );
    // Production renames finished payloads in the tick, before the
    // watcher ignore set is rebuilt.
    manager.finalize_part_files_pass();

    manager.pause_torrent(id, None).await.expect("pause");
    let save_dir = dir.join("downloads");
    let files = manager.get_running_torrent_files(id).expect("file list");
    assert_eq!(files.len(), 2);
    for file in &files {
        let target = resolve_payload_path(&save_dir.join(&file.name));
        std::fs::write(&target, &vec![0u8; file.size as usize / 2])
            .unwrap_or_else(|error| panic!("external write to {target:?}: {error}"));
    }
    let key = manager.torrent_info_hash(id).expect("info hash");
    manager.file_watch_cache.remove(&key);

    let mut torrents = manager.collect_torrents();
    manager.watch_external_files(&mut torrents);
    assert!(
        torrents
            .iter()
            .find(|torrent| torrent.id == id)
            .expect("the torrent is listed")
            .external_changes,
        "the badge has to flag the external writer while the torrent is still paused"
    );

    let result = manager.resume_torrent(id, None).await.expect("resume");
    assert!(
        result.rechecked,
        "resuming after the external writer has to re-verify from disk"
    );
    let check = result.check.expect("the pass reports what it saw");
    assert_eq!(check.total, 2);
    assert!(
        !check.size_mismatch.is_empty(),
        "the shortened files have to show up as a size mismatch"
    );

    let _ = std::fs::remove_dir_all(&dir);
    let _ = std::fs::remove_dir_all(&source_dir);
}

#[tokio::test(flavor = "multi_thread")]
async fn a_selection_left_narrow_by_the_old_mode_is_repaired() {
    let dir = std::env::temp_dir().join(format!("iluha-seq-repair-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("create temp dir");

    #[allow(clippy::cast_sign_loss)]
    let content: Vec<u8> = (0..20 * 1024).map(|i| (i % 251) as u8).collect();
    let (torrent_bytes, source_dir) = create_test_torrent(
        "seq-repair",
        &[("one.bin", content.clone()), ("two.bin", content)],
    );

    let manager = Arc::new(
        TorrentManager::new_test(dir.clone())
            .await
            .expect("session starts"),
    );
    let save_dir = dir.join("downloads").to_string_lossy().to_string();
    let id = manager
        .add_torrent_from_bytes(torrent_bytes, save_dir, None, None, false)
        .await
        .expect("torrent adds");
    wait_for_download_state(&manager, id).await;

    let handle = manager.torrent_handle(id).expect("handle");
    let hash = handle.info_hash().as_string();
    manager
        .file_priorities
        .insert(hash.clone(), vec![FilePriority::Normal; 2]);
    manager.sequential_torrents.insert(hash);
    manager
        .session
        .update_only_files(&handle, &HashSet::from([0]))
        .await
        .expect("narrow the session");
    assert_eq!(handle.only_files().map(|files| files.len()), Some(1));

    manager.advance_sequential_torrents().await;

    assert!(
        manager
            .get_running_torrent_files(id)
            .expect("file list")
            .iter()
            .all(|file| file.selected),
        "the session goes back to what the user actually picked"
    );

    let _ = std::fs::remove_dir_all(&dir);
    let _ = std::fs::remove_dir_all(&source_dir);
}

fn download_limit(bytes_per_second: u32) -> TorrentLimits {
    TorrentLimits {
        download_bps: Some(bytes_per_second),
        upload_bps: None,
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn per_torrent_limits_are_keyed_by_info_hash() {
    let dir = std::env::temp_dir().join(format!("iluha-limits-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("create temp dir");

    #[allow(clippy::cast_sign_loss)]
    let content: Vec<u8> = (0..20 * 1024).map(|i| (i % 251) as u8).collect();
    let (torrent_bytes, source_dir) = create_test_torrent("limits", &[("one.bin", content)]);

    let manager = Arc::new(
        TorrentManager::new_test(dir.clone())
            .await
            .expect("session starts"),
    );
    let save_dir = dir.join("downloads").to_string_lossy().to_string();
    let id = manager
        .add_torrent_from_bytes(torrent_bytes, save_dir, None, None, false)
        .await
        .expect("torrent adds");
    let hash = manager
        .collect_torrents()
        .into_iter()
        .find(|torrent| torrent.id == id)
        .expect("the torrent shows up in the list")
        .info_hash;

    let limits = download_limit(64 * 1024);
    manager
        .set_torrent_limits(id, limits, Some(hash.clone()))
        .await
        .expect("limits apply to a file-backed torrent");

    assert_eq!(manager.get_torrent_limits(id), limits);
    assert_eq!(
        manager
            .registry
            .torrent_limits
            .get(&hash)
            .map(|entry| *entry.value()),
        Some(limits)
    );
    assert!(
        manager
            .collect_torrents()
            .iter()
            .any(|torrent| torrent.id == id),
        "the rewrite must leave the torrent in the session"
    );
    assert_eq!(
        manager.stored_limits(),
        vec![(id, hash, limits)],
        "this is what a restart re-applies"
    );

    let _ = std::fs::remove_dir_all(&dir);
    let _ = std::fs::remove_dir_all(&source_dir);
}

#[tokio::test(flavor = "multi_thread")]
async fn limits_under_a_foreign_key_never_apply() {
    let dir = std::env::temp_dir().join(format!("iluha-limits-stale-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("create temp dir");

    #[allow(clippy::cast_sign_loss)]
    let content: Vec<u8> = (0..20 * 1024).map(|i| (i * 5 % 251) as u8).collect();
    let (torrent_bytes, source_dir) = create_test_torrent("limits-stale", &[("one.bin", content)]);

    let manager = Arc::new(
        TorrentManager::new_test(dir.clone())
            .await
            .expect("session starts"),
    );
    manager
        .registry
        .torrent_limits
        .insert("deadbeef".to_string(), download_limit(32 * 1024));

    let save_dir = dir.join("downloads").to_string_lossy().to_string();
    let id = manager
        .add_torrent_from_bytes(torrent_bytes, save_dir, None, None, false)
        .await
        .expect("torrent adds");

    assert_eq!(manager.get_torrent_limits(id), TorrentLimits::default());
    assert!(
        manager.stored_limits().is_empty(),
        "another torrent's limit is not this torrent's limit"
    );

    let _ = std::fs::remove_dir_all(&dir);
    let _ = std::fs::remove_dir_all(&source_dir);
}

#[tokio::test(flavor = "multi_thread")]
async fn a_tracker_edit_rewrites_from_the_metainfo_and_keeps_the_torrent() {
    let dir = std::env::temp_dir().join(format!("iluha-trackers-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("create temp dir");

    #[allow(clippy::cast_sign_loss)]
    let content: Vec<u8> = (0..20 * 1024).map(|i| (i % 251) as u8).collect();
    let (torrent_bytes, source_dir) = create_test_torrent(
        "trackers",
        &[("one.bin", content.clone()), ("two.bin", content)],
    );

    let manager = Arc::new(
        TorrentManager::new_test(dir.clone())
            .await
            .expect("session starts"),
    );
    let save_dir = dir.join("downloads").to_string_lossy().to_string();
    let id = manager
        .add_torrent_from_bytes(torrent_bytes, save_dir, None, None, false)
        .await
        .expect("torrent adds");
    let hash = manager
        .collect_torrents()
        .into_iter()
        .find(|torrent| torrent.id == id)
        .expect("the torrent shows up in the list")
        .info_hash;

    let tracker = "udp://tracker.example.com:1337/announce".to_string();
    let before = manager
        .live_trackers(id)
        .expect("live trackers before the edit");
    let source =
        manager.tracker_source(id, &hash, Some("trackers"), std::slice::from_ref(&tracker));
    assert!(
        matches!(source, TorrentSource::Bytes(_)),
        "a tracker edit must go back in from the metainfo the session already holds, so it \
         needs no peers and cannot lose the torrent"
    );

    let mut expected = before.clone();
    expected.push(tracker.clone());
    expected.sort();
    manager
        .add_torrent_tracker(id, tracker.clone(), hash.clone())
        .await
        .expect("tracker added");

    assert_eq!(
        manager.live_trackers(id).expect("live trackers"),
        expected,
        "the edit lands: the new tracker is announced, and nothing else is added or lost"
    );
    let files = manager
        .get_running_torrent_files(id)
        .expect("the rewritten torrent still exposes its files");
    assert_eq!(files.len(), 2);
    assert!(
        manager
            .collect_torrents()
            .iter()
            .any(|torrent| torrent.id == id && torrent.info_hash == hash),
        "the rewrite must leave the same torrent in the session"
    );

    let _ = std::fs::remove_dir_all(&dir);
    let _ = std::fs::remove_dir_all(&source_dir);
}

#[tokio::test(flavor = "multi_thread")]
async fn the_file_list_survives_a_rewrite_window() {
    let dir = std::env::temp_dir().join(format!("iluha-window-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("create temp dir");

    #[allow(clippy::cast_sign_loss)]
    let content: Vec<u8> = (0..20 * 1024).map(|i| (i % 251) as u8).collect();
    let (torrent_bytes, source_dir) = create_test_torrent(
        "window",
        &[("one.bin", content.clone()), ("two.bin", content)],
    );

    let manager = Arc::new(
        TorrentManager::new_test(dir.clone())
            .await
            .expect("session starts"),
    );
    let save_dir = dir.join("downloads").to_string_lossy().to_string();
    let id = manager
        .add_torrent_from_bytes(torrent_bytes, save_dir, None, None, false)
        .await
        .expect("torrent adds");
    manager
        .get_running_torrent_files(id)
        .expect("the list is read and cached");

    let window = manager.rewrite_guard();
    manager
        .session
        .delete(id.into(), false)
        .await
        .expect("delete");
    assert!(
        manager
            .get_running_torrent_files(id)
            .is_ok_and(|files| files.len() == 2),
        "while a rewrite is open the UI is served the list it had, not a gap"
    );

    drop(window);
    assert!(
        manager.get_running_torrent_files(id).is_err(),
        "outside a rewrite a missing torrent is reported as missing"
    );
    assert!(
        !manager.files_cache.contains_key(&id),
        "and its cached list goes with it, so a reused id cannot inherit it"
    );

    let _ = std::fs::remove_dir_all(&dir);
    let _ = std::fs::remove_dir_all(&source_dir);
}

#[tokio::test(flavor = "multi_thread")]
async fn a_rewrite_serves_the_old_row_until_the_new_torrent_is_back() {
    let dir = std::env::temp_dir().join(format!("iluha-ghost-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("create temp dir");

    #[allow(clippy::cast_sign_loss)]
    let content: Vec<u8> = (0..20 * 1024).map(|i| (i % 251) as u8).collect();
    let (torrent_bytes, source_dir) = create_test_torrent(
        "ghost",
        &[("one.bin", content.clone()), ("two.bin", content)],
    );

    let manager = Arc::new(
        TorrentManager::new_test(dir.clone())
            .await
            .expect("session starts"),
    );
    let save_dir = dir.join("downloads").to_string_lossy().to_string();
    let id = manager
        .add_torrent_from_bytes(torrent_bytes.clone(), save_dir.clone(), None, None, false)
        .await
        .expect("torrent adds");
    let name = manager
        .collect_torrents()
        .into_iter()
        .find(|torrent| torrent.id == id)
        .expect("the row is there")
        .name;

    let window = manager.rewrite_guard();
    let key = manager.torrent_info_hash(id).expect("info hash");
    manager.capture_rewrite_ghost(id, &key);
    manager
        .session
        .delete(id.into(), false)
        .await
        .expect("delete");

    let during_gap = manager.collect_torrents();
    assert_eq!(
        during_gap
            .iter()
            .filter(|torrent| torrent.info_hash == key)
            .count(),
        1,
        "one torrent is always exactly one row"
    );
    let ghost = during_gap
        .iter()
        .find(|torrent| torrent.info_hash == key)
        .expect("the row does not blink out");
    assert_eq!(ghost.id, id);
    assert_eq!(ghost.name, name, "the stand-in keeps the data the user had");

    let new_id = manager
        .add_torrent_from_bytes(torrent_bytes, save_dir, None, None, false)
        .await
        .expect("re-add");
    let swapped = manager.collect_torrents();
    assert_eq!(
        swapped
            .iter()
            .filter(|torrent| torrent.info_hash == key)
            .count(),
        1,
        "the old and the new row are never on screen together"
    );
    assert_eq!(
        swapped
            .iter()
            .find(|torrent| torrent.info_hash == key)
            .expect("row")
            .id,
        id,
        "the stand-in hides the rewritten torrent until it is cleared"
    );

    manager.clear_rewrite_ghost(&key);
    let after = manager.collect_torrents();
    assert_eq!(
        after
            .iter()
            .find(|torrent| torrent.info_hash == key)
            .expect("row")
            .id,
        new_id,
        "clearing the stand-in reveals the rewritten torrent"
    );
    drop(window);

    let _ = std::fs::remove_dir_all(&dir);
    let _ = std::fs::remove_dir_all(&source_dir);
}

fn stamp(name: &str, expected_len: u64, on_disk: Option<(u64, i64)>) -> FileStamp {
    FileStamp {
        name: name.to_string(),
        expected_len,
        on_disk_len: on_disk.map(|(len, _)| len),
        mtime_secs: on_disk.map(|(_, mtime)| mtime),
    }
}

#[test]
fn changed_file_names_name_exactly_the_moved_files() {
    let base = vec![
        stamp("one.bin", 10, Some((10, 1000))),
        stamp("two.bin", 20, None),
    ];
    assert!(
        TorrentManager::changed_file_names(&base, &base.clone()).is_empty(),
        "an untouched pause names nothing"
    );

    let mut appeared = base.clone();
    appeared[1] = stamp("two.bin", 20, Some((20, 2000)));
    assert_eq!(
        TorrentManager::changed_file_names(&base, &appeared),
        vec!["two.bin"],
        "a file that showed up is named, and only it"
    );

    let mut touched = base.clone();
    touched[0] = stamp("one.bin", 10, Some((10, 1500)));
    assert_eq!(
        TorrentManager::changed_file_names(&base, &touched),
        vec!["one.bin"],
        "a rewrite that keeps the size is still named"
    );

    let mut both = base.clone();
    both[0] = stamp("one.bin", 10, Some((10, 1500)));
    both[1] = stamp("two.bin", 20, Some((20, 2000)));
    assert_eq!(
        TorrentManager::changed_file_names(&base, &both).len(),
        2,
        "both moved files are named"
    );

    assert!(
        TorrentManager::changed_file_names(&base, &base[..1]).is_empty(),
        "a different number of files can only mean a different metainfo, and no file is named"
    );
}

#[test]
fn check_from_stamps_sorts_files_into_missing_size_and_ok() {
    let stamps = vec![
        stamp("ok.bin", 5, Some((5, 1))),
        stamp("gone.bin", 5, None),
        stamp("short.bin", 5, Some((3, 1))),
    ];
    let check = TorrentManager::check_from_stamps(7, &stamps);
    assert_eq!(check.id, 7);
    assert_eq!(check.ok, 1, "only the file that matches its size is ok");
    assert_eq!(check.total, 3);
    assert_eq!(check.missing, vec!["gone.bin".to_string()]);
    assert_eq!(check.size_mismatch, vec!["short.bin".to_string()]);
}

async fn paused_fixture(
    dir: &Path,
    label: &str,
    content: &[u8],
) -> (Arc<TorrentManager>, PathBuf, PathBuf, usize) {
    let (torrent_bytes, source_dir) = create_test_torrent(
        label,
        &[("one.bin", content.to_vec()), ("two.bin", content.to_vec())],
    );
    let manager = Arc::new(
        TorrentManager::new_test(dir.to_path_buf())
            .await
            .expect("session starts"),
    );
    let save_dir = dir.join("downloads");
    std::fs::create_dir_all(&save_dir).expect("create save dir");
    let id = manager
        .add_torrent_from_bytes(
            torrent_bytes,
            save_dir.to_string_lossy().to_string(),
            None,
            None,
            false,
        )
        .await
        .expect("torrent adds");
    wait_for_download_state(&manager, id).await;
    wait_for_files_on_disk(&manager, id, &save_dir).await;
    manager.pause_torrent(id, None).await.expect("pause");
    (manager, save_dir, source_dir, id)
}

#[tokio::test(flavor = "multi_thread")]
async fn resume_without_external_changes_unpauses_without_a_recheck() {
    let dir = std::env::temp_dir().join(format!("iluha-resume-clean-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let content: Vec<u8> = (0..20 * 1024).map(|i| (i % 251) as u8).collect();
    let (manager, _save_dir, source_dir, id) = paused_fixture(&dir, "resume-clean", &content).await;

    let result = manager.resume_torrent(id, None).await.expect("resume");
    assert!(
        !result.rechecked,
        "nothing touched the files, so the resume is a plain unpause"
    );
    assert!(result.check.is_none());

    let _ = std::fs::remove_dir_all(&dir);
    let _ = std::fs::remove_dir_all(&source_dir);
}

#[tokio::test(flavor = "multi_thread")]
async fn renaming_a_torrent_moves_its_root_folder_and_paths() {
    let dir = std::env::temp_dir().join(format!("iluha-rename-root-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let content: Vec<u8> = (0..20 * 1024).map(|i| (i % 251) as u8).collect();
    let (torrent_bytes, source_dir) = create_test_torrent(
        "rename-root",
        &[("Show/one.bin", content.clone()), ("Show/two.bin", content)],
    );
    let manager = Arc::new(
        TorrentManager::new_test(dir.clone())
            .await
            .expect("session starts"),
    );
    let save_dir = dir.join("downloads");
    std::fs::create_dir_all(&save_dir).expect("create save dir");
    let id = manager
        .add_torrent_from_bytes(
            torrent_bytes,
            save_dir.to_string_lossy().to_string(),
            None,
            None,
            false,
        )
        .await
        .expect("torrent adds");
    wait_for_download_state(&manager, id).await;
    manager.pause_torrent(id, None).await.expect("pause");
    let key = manager.torrent_info_hash(id).expect("info hash");
    let files = manager.get_running_torrent_files(id).expect("file list");
    let old_root = files[0]
        .name
        .split(['/', '\\'])
        .next()
        .expect("root folder")
        .to_string();
    let old_path = save_dir.join(&old_root);
    if !old_path.exists() {
        std::fs::create_dir_all(&old_path).expect("create old root");
    }
    let new_root = "Renamed Show";
    let new_path = save_dir.join(new_root);

    manager
        .rename_torrent(id, Some(&key), Some(new_root.to_string()))
        .await
        .expect("rename torrent");

    assert!(!old_path.exists(), "the old root folder must be gone");
    assert!(new_path.is_dir(), "the new root folder must exist");
    let files = manager
        .get_running_torrent_files(id)
        .expect("file list after rename");
    assert!(
        files.iter().all(|file| file.name.starts_with(new_root)),
        "the engine has to resolve payloads under the new root: {files:?}"
    );
    assert_eq!(
        manager
            .registry
            .aliases
            .get(&key)
            .map(|entry| entry.clone()),
        Some(new_root.to_string())
    );
    assert_eq!(
        manager
            .registry
            .root_names
            .get(&key)
            .map(|entry| entry.clone()),
        Some(new_root.to_string())
    );

    let _ = std::fs::remove_dir_all(&dir);
    let _ = std::fs::remove_dir_all(&source_dir);
}

#[tokio::test(flavor = "multi_thread")]
async fn the_paused_watcher_raises_the_badge_before_resume() {
    let dir = std::env::temp_dir().join(format!("iluha-paused-watch-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let content: Vec<u8> = (0..20 * 1024).map(|i| (i % 251) as u8).collect();
    let (manager, save_dir, source_dir, id) = paused_fixture(&dir, "paused-watch", &content).await;

    let mut torrents = manager.collect_torrents();
    manager.watch_external_files(&mut torrents);
    let watched = torrents
        .iter()
        .find(|t| t.id == id)
        .expect("the torrent is listed");
    assert!(
        !watched.external_changes,
        "a freshly paused torrent is clean"
    );

    let files = manager.get_running_torrent_files(id).expect("file list");
    for file in &files {
        let target = resolve_payload_path(&save_dir.join(&file.name));
        std::fs::write(&target, &content[..content.len() - 1024])
            .unwrap_or_else(|error| panic!("external write to {target:?}: {error}"));
    }
    let key = manager.torrent_info_hash(id).expect("info hash");
    manager.file_watch_cache.remove(&key);

    let mut torrents = manager.collect_torrents();
    manager.watch_external_files(&mut torrents);
    let watched = torrents
        .iter()
        .find(|t| t.id == id)
        .expect("the torrent is listed");
    assert!(
        watched.external_changes,
        "an outside edit has to raise the badge while the torrent is still paused"
    );
    assert_eq!(
        watched.external_changed_files,
        files.iter().map(|f| f.name.clone()).collect::<Vec<_>>(),
        "the badge names exactly the files that moved"
    );

    let _ = std::fs::remove_dir_all(&dir);
    let _ = std::fs::remove_dir_all(&source_dir);
}

#[tokio::test(flavor = "multi_thread")]
async fn the_finished_watcher_flags_outside_edits() {
    let dir = std::env::temp_dir().join(format!("iluha-finished-watch-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let (torrent_bytes, source_dir, _root, _nested) = swarm_fixture("swarm-finished");
    let (_seeder, seeder_addr) = start_local_seeder(&dir, &torrent_bytes, &source_dir).await;
    let manager = Arc::new(
        TorrentManager::new_test(dir.join("leech"))
            .await
            .expect("session starts"),
    );
    let id = download_from_local_seeder(&manager, torrent_bytes, &dir, seeder_addr, false).await;

    let deadline = Instant::now() + Duration::from_secs(90);
    let is_finished = |manager: &Arc<TorrentManager>| {
        manager
            .collect_torrents()
            .iter()
            .any(|torrent| torrent.id == id && torrent.finished)
    };
    while Instant::now() < deadline && !is_finished(&manager) {
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    assert!(
        is_finished(&manager),
        "the leecher has to hold every byte before the watch starts"
    );
    // Production renames finished payloads in the tick, before the
    // watcher ignore set is rebuilt.
    manager.finalize_part_files_pass();
    let save_dir = dir.join("downloads");

    let mut torrents = manager.collect_torrents();
    manager.watch_external_files(&mut torrents);
    let watched = torrents
        .iter()
        .find(|t| t.id == id)
        .expect("the torrent is listed");
    assert!(
        !watched.external_changes,
        "a freshly finished torrent is clean"
    );

    let files = manager.get_running_torrent_files(id).expect("file list");
    for file in &files {
        let target = resolve_payload_path(&save_dir.join(&file.name));
        let meta = std::fs::metadata(&target)
            .unwrap_or_else(|error| panic!("file on disk at {target:?}: {error}"));
        std::fs::write(&target, &vec![0u8; meta.len() as usize / 2])
            .unwrap_or_else(|error| panic!("external write to {target:?}: {error}"));
    }
    let key = manager.torrent_info_hash(id).expect("info hash");
    manager.file_watch_cache.remove(&key);

    let mut torrents = manager.collect_torrents();
    manager.watch_external_files(&mut torrents);
    let watched = torrents
        .iter()
        .find(|t| t.id == id)
        .expect("the torrent is listed");
    assert!(
        watched.external_changes,
        "an outside edit has to raise the badge on a finished torrent"
    );
    assert_eq!(
        watched.external_changed_files,
        files.iter().map(|f| f.name.clone()).collect::<Vec<_>>(),
        "the badge names exactly the files that moved"
    );

    let _ = std::fs::remove_dir_all(&dir);
    let _ = std::fs::remove_dir_all(&source_dir);
}

#[tokio::test(flavor = "multi_thread")]
async fn recheck_from_the_badge_reverifies_and_stays_paused() {
    let dir = std::env::temp_dir().join(format!("iluha-recheck-paused-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let content: Vec<u8> = (0..20 * 1024).map(|i| (i % 251) as u8).collect();
    let (manager, save_dir, source_dir, id) =
        paused_fixture(&dir, "recheck-paused", &content).await;

    let files = manager.get_running_torrent_files(id).expect("file list");
    for file in &files {
        let target = resolve_payload_path(&save_dir.join(&file.name));
        std::fs::write(&target, &content[..content.len() - 1024])
            .unwrap_or_else(|error| panic!("external write to {target:?}: {error}"));
    }

    let result = manager
        .recheck_paused_torrent(id, None)
        .await
        .expect("recheck");
    assert!(
        result.rechecked,
        "the badge action has to re-verify from disk"
    );
    let check = result.check.expect("the pass reports what it saw");
    assert_eq!(check.size_mismatch.len(), 2);
    assert!(
        manager.torrent_is_paused(result.id),
        "rechecking from the badge must leave the torrent paused"
    );

    let mut torrents = manager.collect_torrents();
    manager.watch_external_files(&mut torrents);
    assert!(
        !torrents
            .iter()
            .find(|t| t.id == result.id)
            .expect("the torrent is listed")
            .external_changes
    );

    let _ = std::fs::remove_dir_all(&dir);
    let _ = std::fs::remove_dir_all(&source_dir);
}

#[tokio::test(flavor = "multi_thread")]
async fn a_finished_torrent_keeps_the_unselected_placeholder_without_a_badge() {
    let dir = std::env::temp_dir().join(format!("iluha-placeholder-badge-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let (torrent_bytes, source_dir) = create_test_torrent(
        "placeholder-badge",
        &[
            ("done.bin", payload_bytes(64 * 1024)),
            ("unselected.bin", payload_bytes(32 * 1024)),
        ],
    );
    let (_seeder, addr) = start_local_seeder(&dir, &torrent_bytes, &source_dir).await;
    let manager = Arc::new(
        TorrentManager::new_test(dir.clone())
            .await
            .expect("session starts"),
    );
    let save_dir = dir.join("downloads");
    std::fs::create_dir_all(&save_dir).expect("create save dir");
    manager.peer_hints.lock().expect("peer hints").push(addr);
    let id = manager
        .add_torrent_from_bytes(
            torrent_bytes,
            save_dir.to_string_lossy().to_string(),
            Some(vec![0]),
            None,
            false,
        )
        .await
        .expect("torrent adds");
    wait_for_download_state(&manager, id).await;

    let deadline = Instant::now() + Duration::from_secs(60);
    while Instant::now() < deadline {
        if manager
            .collect_torrents()
            .iter()
            .any(|torrent| torrent.id == id && torrent.finished)
        {
            break;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    assert!(
        manager
            .collect_torrents()
            .iter()
            .any(|torrent| torrent.id == id && torrent.finished),
        "the selected file has to finish"
    );

    let unselected_part = part_file_path(&save_dir.join("unselected.bin"));
    assert!(
        unselected_part.is_file(),
        "the engine keeps an empty .part placeholder for the unselected file"
    );

    manager.pause_torrent(id, None).await.expect("pause");
    manager.finalize_part_files_pass();
    assert!(
        unselected_part.is_file(),
        "the finalize pass keeps the placeholder, so selecting the file later needs no re-add"
    );

    let mut torrents = manager.collect_torrents();
    manager.watch_external_files(&mut torrents);
    let watched = torrents
        .iter()
        .find(|torrent| torrent.id == id)
        .expect("the torrent is listed");
    assert!(
        !watched.external_changes,
        "the finalize pass must not touch the folder of a finished torrent"
    );

    let _ = std::fs::remove_dir_all(&dir);
    let _ = std::fs::remove_dir_all(&source_dir);
}

#[tokio::test(flavor = "multi_thread")]
async fn the_lightweight_recheck_clears_the_external_badge() {
    let dir = std::env::temp_dir().join(format!("iluha-recheck-badge-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let content: Vec<u8> = (0..20 * 1024).map(|i| (i % 251) as u8).collect();
    let (manager, save_dir, source_dir, id) = paused_fixture(&dir, "recheck-badge", &content).await;

    let files = manager.get_running_torrent_files(id).expect("file list");
    let target = resolve_payload_path(&save_dir.join(&files[0].name));
    std::fs::write(&target, &content[..content.len() - 1024])
        .unwrap_or_else(|error| panic!("external write to {target:?}: {error}"));
    let key = manager.torrent_info_hash(id).expect("info hash");
    manager.file_watch_cache.remove(&key);

    let mut torrents = manager.collect_torrents();
    manager.watch_external_files(&mut torrents);
    assert!(
        torrents
            .iter()
            .find(|torrent| torrent.id == id)
            .expect("the torrent is listed")
            .external_changes,
        "the external write raises the badge"
    );

    let check = manager.recheck_torrent(id, None).expect("recheck");
    assert!(
        !check.size_mismatch.is_empty() || !check.missing.is_empty(),
        "the recheck reports the changed file"
    );

    let mut torrents = manager.collect_torrents();
    manager.watch_external_files(&mut torrents);
    assert!(
        !torrents
            .iter()
            .find(|torrent| torrent.id == id)
            .expect("the torrent is listed")
            .external_changes,
        "the user-requested recheck resets the baseline"
    );

    let _ = std::fs::remove_dir_all(&dir);
    let _ = std::fs::remove_dir_all(&source_dir);
}

#[tokio::test(flavor = "multi_thread")]
async fn resume_after_external_writes_reverifies_from_disk() {
    let dir = std::env::temp_dir().join(format!("iluha-resume-external-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let content: Vec<u8> = (0..20 * 1024).map(|i| (i % 251) as u8).collect();
    let (manager, save_dir, source_dir, id) =
        paused_fixture(&dir, "resume-external", &content).await;

    let files = manager.get_running_torrent_files(id).expect("file list");
    assert_eq!(files.len(), 2);
    for (position, file) in files.iter().enumerate() {
        let shortened = &content[..content.len() - (position + 1) * 1024];
        let target = resolve_payload_path(&save_dir.join(&file.name));
        std::fs::write(&target, shortened)
            .unwrap_or_else(|error| panic!("external write to {target:?}: {error}"));
    }

    let result = manager.resume_torrent(id, None).await.expect("resume");
    assert!(
        result.rechecked,
        "files that changed while paused must trigger a re-verify, not a blind unpause"
    );
    let check = result.check.expect("a recheck reports what it saw on disk");
    assert_eq!(check.total, 2);
    assert_eq!(
        check.ok, 0,
        "neither file matches its expected size anymore"
    );
    assert!(check.missing.is_empty());
    assert_eq!(check.size_mismatch.len(), 2);

    let _ = std::fs::remove_dir_all(&dir);
    let _ = std::fs::remove_dir_all(&source_dir);
}

#[tokio::test(flavor = "multi_thread")]
async fn incomplete_files_are_part_files_until_their_last_byte() {
    let dir = std::env::temp_dir().join(format!("iluha-hide-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let content: Vec<u8> = (0..4 * 1024 * 1024).map(|i| (i % 251) as u8).collect();
    let (torrent_bytes, source_dir) =
        create_test_torrent("hide-partial", &[("Episode 01.mkv", content)]);
    let (seeder, addr) = start_local_seeder(&dir, &torrent_bytes, &source_dir).await;
    seeder
        .ratelimits
        .set_upload_bps(NonZeroU32::new(512 * 1024));

    let manager = Arc::new(
        TorrentManager::new_test(dir.clone())
            .await
            .expect("session starts"),
    );
    let id = download_from_local_seeder(&manager, torrent_bytes, &dir, addr, false).await;
    let save_dir = dir.join("downloads");

    let deadline = Instant::now() + Duration::from_secs(30);
    let mut partial = None;
    while Instant::now() < deadline {
        if let Ok(files) = manager.get_running_torrent_files(id) {
            if let Some(file) = files.first() {
                if file.progress_bytes > 0 && !file.completed {
                    partial = Some(file.clone());
                    break;
                }
            }
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    let partial = partial.expect("a throttled local swarm must expose a partial file");
    let final_path = save_dir.join(&partial.name);
    let part_path = part_file_path(&final_path);
    assert!(
        part_path.is_file(),
        "an incomplete payload lives at its .part path"
    );
    assert!(
        !final_path.exists(),
        "the final name must not appear before the last byte"
    );
    #[cfg(windows)]
    assert!(
        crate::torrent::disk::is_hidden(&part_path),
        "an incomplete payload is hidden while it downloads"
    );
    if manager.sparse_capable(&save_dir.to_string_lossy()) == Some(true) {
        eprintln!(
            "partial allocation: {} on disk, {} written, {} total",
            partial.on_disk_bytes, partial.progress_bytes, partial.size
        );
        assert!(
            partial.on_disk_bytes <= partial.progress_bytes + 1024 * 1024,
            "sparse allocation has to track progress: {} allocated for {} written of {}",
            partial.on_disk_bytes,
            partial.progress_bytes,
            partial.size
        );
        assert!(
            partial.on_disk_bytes < partial.size,
            "a sparse partial file must not allocate its final size: {} of {}",
            partial.on_disk_bytes,
            partial.size
        );
    }

    let hash = manager.torrent_info_hash(id).expect("info hash");
    manager.registry.partial_leftovers.insert(
        hash.clone(),
        PartialLeftover {
            info_hash: hash.clone(),
            name: "Show".to_string(),
            save_dir: save_dir.to_string_lossy().to_string(),
            files: vec![PartialLeftoverFile {
                name: part_path
                    .strip_prefix(&save_dir)
                    .unwrap_or(&part_path)
                    .to_string_lossy()
                    .to_string(),
                size: partial.size,
                on_disk_bytes: partial.on_disk_bytes,
            }],
            removed_at: 1,
        },
    );
    assert!(
        manager.list_partial_leftovers().is_empty(),
        "a leftover record for an active torrent has to stay hidden"
    );
    assert_eq!(
        manager.clear_partial_leftovers(None),
        0,
        "cleanup must never delete the payload of an active torrent"
    );
    assert!(part_path.exists(), "the active partial survives cleanup");

    let (roots, files) = manager.active_download_paths();
    assert!(
        roots.iter().any(|root| *root == save_dir.to_string_lossy()),
        "the output root is filtered"
    );
    assert!(
        files.iter().any(|file| file.contains("Episode 01.mkv")),
        "the incomplete payload file is filtered"
    );

    let deadline = Instant::now() + Duration::from_secs(60);
    let mut finished = false;
    while Instant::now() < deadline {
        if manager
            .get_running_torrent_files(id)
            .is_ok_and(|files| files.first().is_some_and(|file| file.completed))
        {
            finished = true;
            break;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    assert!(finished, "the throttled download has to finish in the test");
    manager.finalize_part_files_pass();
    assert!(
        final_path.is_file(),
        "the last byte renames the payload to its final name"
    );
    assert!(!part_path.exists(), "no .part twin survives the rename");
    assert!(
        !crate::torrent::disk::is_hidden(&final_path),
        "the renamed payload is visible"
    );
    assert!(
        manager.list_partial_leftovers().is_empty(),
        "completion drops the stale leftover record"
    );
    assert!(
        manager.registry.partial_leftovers.get(&hash).is_none(),
        "the record is gone, not just hidden"
    );
    assert!(final_path.exists(), "dropping the record keeps the payload");

    manager
        .update_torrent_only_files(id, Vec::new(), None)
        .await
        .expect("deselect every file");
    manager.reconcile_file_visibility();
    assert!(
        final_path.is_file(),
        "a completed file stays on disk when the user unselects it"
    );

    let (_, files) = manager.active_download_paths();
    assert!(
        files.is_empty(),
        "a finished torrent no longer suppresses its folder events"
    );

    manager
        .remove_torrent(id, true, None)
        .await
        .expect("remove");
    let _ = std::fs::remove_dir_all(&dir);
    let _ = std::fs::remove_dir_all(&source_dir);
}

/// Payload bytes with a repeating pattern, so the engine sees real data.
fn payload_bytes(len: usize) -> Vec<u8> {
    let pattern = [7u8; 251];
    (0..len).map(|index| pattern[index % 251]).collect()
}

#[tokio::test(flavor = "multi_thread")]
async fn a_fresh_add_keeps_the_file_that_is_already_there_until_the_payload_is_complete() {
    let dir = std::env::temp_dir().join(format!("iluha-collision-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let content = payload_bytes(512 * 1024);
    let (torrent_bytes, source_dir) =
        create_test_torrent("collision", &[("Episode 01.mkv", content.clone())]);
    let (seeder, addr) = start_local_seeder(&dir, &torrent_bytes, &source_dir).await;
    seeder
        .ratelimits
        .set_upload_bps(NonZeroU32::new(128 * 1024));

    let manager = Arc::new(
        TorrentManager::new_test(dir.clone())
            .await
            .expect("session starts"),
    );
    let save_dir = dir.join("downloads");
    std::fs::create_dir_all(&save_dir).expect("create save dir");
    let existing = save_dir.join("Episode 01.mkv");
    std::fs::write(&existing, b"older file").expect("write the file that is already there");

    let id = download_from_local_seeder(&manager, torrent_bytes, &dir, addr, false).await;
    assert_eq!(
        std::fs::read(&existing).expect("read the file that is already there"),
        b"older file".to_vec(),
        "a fresh add must not write over the file that is already there"
    );
    assert!(
        part_file_path(&existing).is_file(),
        "the download goes to the .part twin"
    );
    #[cfg(windows)]
    assert!(
        crate::torrent::disk::is_hidden(&part_file_path(&existing)),
        "a fresh add hides the .part twin without waiting for the tick"
    );

    // The file that is already there is not the payload of this torrent,
    // so the reconcile pass has to leave it visible.
    manager.reconcile_file_visibility();
    assert!(
        !crate::torrent::disk::is_hidden(&existing),
        "a file that is not the payload of the torrent must stay visible"
    );

    let deadline = Instant::now() + Duration::from_secs(60);
    let mut replaced = false;
    while Instant::now() < deadline {
        manager.finalize_part_files_pass();
        if std::fs::read(&existing).is_ok_and(|data| data == content) {
            replaced = true;
            break;
        }
        eprintln!(
            "debug: part={:?} info={:?}",
            part_file_path(&existing).metadata().map(|m| m.len()),
            manager
                .collect_torrents()
                .iter()
                .map(|t| (
                    t.id,
                    t.state.clone(),
                    t.download_speed,
                    t.peers_connected,
                    t.progress_bytes,
                    t.error.clone()
                ))
                .collect::<Vec<_>>()
        );
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    assert!(
        replaced,
        "the finished payload has to replace the file that was there"
    );
    assert!(
        !part_file_path(&existing).exists(),
        "no .part twin survives the rename"
    );
    assert!(
        !crate::torrent::disk::is_hidden(&existing),
        "the finalized payload is visible again"
    );

    manager
        .remove_torrent(id, true, None)
        .await
        .expect("remove");
    let _ = std::fs::remove_dir_all(&dir);
    let _ = std::fs::remove_dir_all(&source_dir);
}

#[tokio::test(flavor = "multi_thread")]
async fn a_finished_payload_is_renamed_while_another_one_stays_a_part_file() {
    let dir = std::env::temp_dir().join(format!("iluha-mixed-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let small = payload_bytes(64 * 1024);
    let large = payload_bytes(2 * 1024 * 1024);
    let (torrent_bytes, source_dir) = create_test_torrent(
        "mixed",
        &[("Show - 01.mkv", small), ("Show - 02.mkv", large)],
    );
    let (seeder, addr) = start_local_seeder(&dir, &torrent_bytes, &source_dir).await;
    seeder
        .ratelimits
        .set_upload_bps(NonZeroU32::new(256 * 1024));

    let manager = Arc::new(
        TorrentManager::new_test(dir.clone())
            .await
            .expect("session starts"),
    );
    let id = download_from_local_seeder(&manager, torrent_bytes, &dir, addr, false).await;
    let save_dir = dir.join("downloads");

    let finished = first_file_to_finish(&manager, id, Duration::from_secs(60))
        .await
        .expect("one payload has to finish first");
    manager.finalize_part_files_pass();

    // The second payload has to carry data, otherwise it is only an empty
    // placeholder and the removal has nothing to record.
    let deadline = Instant::now() + Duration::from_secs(30);
    while Instant::now() < deadline {
        let files = manager.get_running_torrent_files(id).expect("file list");
        if files
            .iter()
            .any(|file| file.index != finished && file.progress_bytes > 0)
        {
            break;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }

    let files = manager.get_running_torrent_files(id).expect("file list");
    let finished_name = files
        .iter()
        .find(|file| file.index == finished)
        .expect("the finished file is in the list")
        .name
        .clone();
    let pending_name = files
        .iter()
        .find(|file| file.index != finished)
        .expect("the pending file is in the list")
        .name
        .clone();
    let finished_path = save_dir.join(&finished_name);
    let pending_path = save_dir.join(&pending_name);
    assert!(
        finished_path.is_file(),
        "the finished payload reaches its final name"
    );
    assert!(
        !part_file_path(&finished_path).exists(),
        "no .part twin survives the rename"
    );
    assert!(
        part_file_path(&pending_path).is_file(),
        "the unfinished payload stays a .part file"
    );
    assert!(
        !pending_path.exists(),
        "the unfinished payload has no final name yet"
    );
    #[cfg(windows)]
    assert!(
        crate::torrent::disk::is_hidden(&part_file_path(&pending_path)),
        "the unfinished payload is hidden while it downloads"
    );
    assert!(
        !crate::torrent::disk::is_hidden(&finished_path),
        "the finished payload is visible"
    );

    manager
        .update_torrent_only_files(id, vec![finished], None)
        .await
        .expect("deselect the pending payload");
    let deadline = Instant::now() + Duration::from_secs(30);
    let mut complete = false;
    while Instant::now() < deadline {
        if manager
            .collect_torrents()
            .iter()
            .any(|torrent| torrent.id == id && torrent.finished)
        {
            complete = true;
            break;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    assert!(
        complete,
        "deselecting the last payload finishes the torrent"
    );

    manager
        .remove_torrent(id, false, None)
        .await
        .expect("remove keeping files");
    let leftovers = manager.list_partial_leftovers();
    assert_eq!(leftovers.len(), 1, "keeping files records the partial");
    assert!(
        leftovers[0]
            .files
            .iter()
            .any(|file| file.name == format!("{pending_name}.part")),
        "the leftover record names the unselected .part file of a finished torrent"
    );
    assert!(
        !leftovers[0]
            .files
            .iter()
            .any(|file| file.name == finished_name),
        "the finished payload is not a leftover"
    );

    let _ = std::fs::remove_dir_all(&dir);
    let _ = std::fs::remove_dir_all(&source_dir);
}

#[tokio::test(flavor = "multi_thread")]
async fn a_deleted_part_file_is_recreated_and_the_download_continues() {
    let dir = std::env::temp_dir().join(format!("iluha-repair-live-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let content = payload_bytes(512 * 1024);
    let (torrent_bytes, source_dir) =
        create_test_torrent("repair-live", &[("Episode 01.mkv", content.clone())]);
    let (seeder, addr) = start_local_seeder(&dir, &torrent_bytes, &source_dir).await;
    seeder
        .ratelimits
        .set_upload_bps(NonZeroU32::new(256 * 1024));

    let manager = Arc::new(
        TorrentManager::new_test(dir.clone())
            .await
            .expect("session starts"),
    );
    let id = download_from_local_seeder(&manager, torrent_bytes, &dir, addr, false).await;
    let save_dir = dir.join("downloads");
    let final_path = save_dir.join("Episode 01.mkv");
    let part_path = part_file_path(&final_path);

    let deadline = Instant::now() + Duration::from_secs(30);
    let mut partial = false;
    while Instant::now() < deadline {
        let progress = manager
            .get_running_torrent_files(id)
            .ok()
            .and_then(|files| files.first().map(|file| file.progress_bytes))
            .unwrap_or(0);
        if progress > 0 {
            partial = true;
            break;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    assert!(
        partial,
        "the throttled download has to land some bytes first"
    );

    std::fs::remove_file(&part_path).expect("delete the payload of a live torrent");
    assert!(!part_path.exists());

    manager.detect_missing_payloads();
    assert_eq!(
        manager.repair_requests.len(),
        1,
        "a missing selected payload queues a repair"
    );
    manager.process_repair_requests().await;
    assert!(
        manager.repair_requests.is_empty(),
        "the tick drains the repair queue"
    );

    let deadline = Instant::now() + Duration::from_secs(60);
    let mut finished = false;
    while Instant::now() < deadline {
        manager.finalize_part_files_pass();
        if std::fs::read(&final_path).is_ok_and(|data| data == content) {
            finished = true;
            break;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    assert!(part_path.is_file() || final_path.is_file());
    assert!(
        finished,
        "the repaired torrent has to recreate the payload and finish it"
    );

    let _ = std::fs::remove_dir_all(&dir);
    let _ = std::fs::remove_dir_all(&source_dir);
}

#[tokio::test(flavor = "multi_thread")]
async fn a_paused_torrent_recreates_its_deleted_part_file() {
    let dir = std::env::temp_dir().join(format!("iluha-repair-paused-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let content = payload_bytes(512 * 1024);
    let (torrent_bytes, source_dir) =
        create_test_torrent("repair-paused", &[("Episode 01.mkv", content)]);
    let (seeder, addr) = start_local_seeder(&dir, &torrent_bytes, &source_dir).await;
    seeder.ratelimits.set_upload_bps(NonZeroU32::new(64 * 1024));

    let manager = Arc::new(
        TorrentManager::new_test(dir.clone())
            .await
            .expect("session starts"),
    );
    let id = download_from_local_seeder(&manager, torrent_bytes, &dir, addr, false).await;
    let save_dir = dir.join("downloads");
    let part_path = part_file_path(&save_dir.join("Episode 01.mkv"));

    let deadline = Instant::now() + Duration::from_secs(30);
    let mut partial = false;
    while Instant::now() < deadline {
        let progress = manager
            .get_running_torrent_files(id)
            .ok()
            .and_then(|files| files.first().map(|file| file.progress_bytes))
            .unwrap_or(0);
        if progress > 0 {
            partial = true;
            break;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    assert!(
        partial,
        "the throttled download has to land some bytes first"
    );

    manager.pause_torrent(id, None).await.expect("pause");
    std::fs::remove_file(&part_path).expect("delete the payload of a paused torrent");

    manager.detect_missing_payloads();
    assert_eq!(manager.repair_requests.len(), 1);
    manager.process_repair_requests().await;

    let deadline = Instant::now() + Duration::from_secs(30);
    let mut recreated = false;
    while Instant::now() < deadline {
        if part_path.is_file() {
            recreated = true;
            break;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    assert!(
        recreated,
        "the repair recreates the .part twin of a paused torrent"
    );
    // The re-added torrent runs its initial check before it settles, so
    // wait it out instead of catching the state mid-initialization.
    let deadline = Instant::now() + Duration::from_secs(10);
    while Instant::now() < deadline
        && manager
            .collect_torrents()
            .iter()
            .any(|torrent| torrent.state == "initializing")
    {
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    let paused = manager
        .collect_torrents()
        .iter()
        .any(|torrent| torrent.state == "paused");
    assert!(paused, "a repair must not start a paused torrent");

    let _ = std::fs::remove_dir_all(&dir);
    let _ = std::fs::remove_dir_all(&source_dir);
}

#[tokio::test(flavor = "multi_thread")]
async fn a_selected_file_at_zero_progress_takes_no_space_on_a_sparse_volume() {
    let dir = std::env::temp_dir().join(format!("iluha-zero-alloc-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let content = payload_bytes(4 * 1024 * 1024);
    let (torrent_bytes, source_dir) =
        create_test_torrent("zero-alloc", &[("Episode 01.mkv", content)]);

    // No seeder and no DHT: the torrent initializes and stays at 0%.
    let manager = Arc::new(
        TorrentManager::new_test(dir.clone())
            .await
            .expect("session starts"),
    );
    let save_dir = dir.join("downloads");
    let id = manager
        .add_torrent_from_bytes(
            torrent_bytes,
            save_dir.to_string_lossy().to_string(),
            Some(vec![0]),
            None,
            false,
        )
        .await
        .expect("add");
    let part_path = part_file_path(&save_dir.join("Episode 01.mkv"));
    let deadline = Instant::now() + Duration::from_secs(30);
    while Instant::now() < deadline && !part_path.is_file() {
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    assert!(
        part_path.is_file(),
        "the engine preallocates the .part twin during its initial check"
    );

    let files = manager.get_running_torrent_files(id).expect("file list");
    let size = files[0].size;
    assert_eq!(
        files[0].progress_bytes, 0,
        "nothing may be downloaded without peers"
    );

    let allocated = crate::torrent::disk::allocated_bytes(&part_path).expect("allocated size");
    if manager.sparse_capable(&save_dir.to_string_lossy()) == Some(true) {
        assert!(
            allocated < 1024 * 1024,
            "a 0% payload must not allocate a megabyte: {allocated}"
        );
        assert!(
            allocated < size / 100,
            "a 0% payload must stay under 1% of {size}, got {allocated}"
        );
    }

    manager
        .remove_torrent(id, true, None)
        .await
        .expect("remove");
    let _ = std::fs::remove_dir_all(&dir);
    let _ = std::fs::remove_dir_all(&source_dir);
}

#[tokio::test(flavor = "multi_thread")]
async fn selecting_a_file_after_the_finish_downloads_it() {
    let dir = std::env::temp_dir().join(format!("iluha-reselect-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let first = payload_bytes(64 * 1024);
    let second = payload_bytes(32 * 1024);
    let (torrent_bytes, source_dir) = create_test_torrent(
        "reselect",
        &[
            ("Episode 01.mkv", first),
            ("Episode 02.mkv", second.clone()),
        ],
    );
    let (seeder, addr) = start_local_seeder(&dir, &torrent_bytes, &source_dir).await;
    seeder
        .ratelimits
        .set_upload_bps(NonZeroU32::new(256 * 1024));

    let manager = Arc::new(
        TorrentManager::new_test(dir.clone())
            .await
            .expect("session starts"),
    );
    let save_dir = dir.join("downloads");
    manager.peer_hints.lock().expect("peer hints").push(addr);
    let id = manager
        .add_torrent_from_bytes(
            torrent_bytes,
            save_dir.to_string_lossy().to_string(),
            Some(vec![0]),
            None,
            false,
        )
        .await
        .expect("add");
    wait_for_download_state(&manager, id).await;

    let deadline = Instant::now() + Duration::from_secs(60);
    while Instant::now() < deadline {
        if manager
            .collect_torrents()
            .iter()
            .any(|torrent| torrent.id == id && torrent.finished)
        {
            break;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    assert!(
        manager
            .collect_torrents()
            .iter()
            .any(|torrent| torrent.id == id && torrent.finished),
        "the selected file has to finish"
    );

    let files = manager.get_running_torrent_files(id).expect("file list");
    let pending = files
        .iter()
        .find(|file| !file.selected)
        .expect("the unselected file stays in the list")
        .clone();
    let all_indices: Vec<usize> = files.iter().map(|file| file.index).collect();
    let pending_path = save_dir.join(&pending.name);
    let pending_part = part_file_path(&pending_path);
    assert!(
        pending_part.is_file(),
        "the unselected file keeps its empty placeholder"
    );
    assert!(
        !pending_path.exists(),
        "the unselected file has no final name yet"
    );

    manager.finalize_part_files_pass();
    assert!(
        pending_part.is_file(),
        "the finish keeps the placeholder, so a later selection writes into it"
    );

    manager
        .update_torrent_only_files(id, all_indices, None)
        .await
        .expect("select the second file");

    let deadline = Instant::now() + Duration::from_secs(60);
    let mut completed = false;
    while Instant::now() < deadline {
        manager.finalize_part_files_pass();
        if std::fs::read(&pending_path).is_ok_and(|data| data == second) {
            completed = true;
            break;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    assert!(
        completed,
        "selecting a file after the finish downloads it into its final name"
    );

    let _ = std::fs::remove_dir_all(&dir);
    let _ = std::fs::remove_dir_all(&source_dir);
}

#[tokio::test(flavor = "multi_thread")]
async fn removing_a_finished_torrent_finalizes_the_part_before_keeping_files() {
    let dir = std::env::temp_dir().join(format!("iluha-remove-finished-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let content = payload_bytes(2 * 1024 * 1024);
    let (torrent_bytes, source_dir) =
        create_test_torrent("remove-finished", &[("Episode 01.mkv", content)]);
    let (seeder, addr) = start_local_seeder(&dir, &torrent_bytes, &source_dir).await;
    seeder
        .ratelimits
        .set_upload_bps(NonZeroU32::new(256 * 1024));

    let manager = Arc::new(
        TorrentManager::new_test(dir.clone())
            .await
            .expect("session starts"),
    );
    let id = download_from_local_seeder(&manager, torrent_bytes, &dir, addr, false).await;
    let save_dir = dir.join("downloads");

    let deadline = Instant::now() + Duration::from_secs(90);
    let mut name = String::new();
    while Instant::now() < deadline {
        if let Ok(files) = manager.get_running_torrent_files(id) {
            if let Some(file) = files.first() {
                if file.completed {
                    name = file.name.clone();
                    break;
                }
            }
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    assert!(!name.is_empty(), "the download has to finish in the test");
    let final_path = save_dir.join(&name);
    let part_path = part_file_path(&final_path);
    assert!(
        part_path.is_file(),
        "the payload is still a .part until the tick finalizes it"
    );
    assert!(!final_path.exists(), "the final name appears on finalize");

    manager
        .remove_torrent(id, false, None)
        .await
        .expect("remove keeping files");
    assert!(
        final_path.is_file(),
        "removing a finished torrent finalizes its .part first"
    );
    assert!(!part_path.exists(), "no orphan .part survives the removal");
    assert!(
        manager.list_partial_leftovers().is_empty(),
        "the finished payload is not recorded as a leftover"
    );

    let _ = std::fs::remove_dir_all(&dir);
    let _ = std::fs::remove_dir_all(&source_dir);
}

#[tokio::test(flavor = "multi_thread")]
async fn removing_a_torrent_with_files_deletes_the_part_twin_and_keeps_the_foreign_file() {
    let dir = std::env::temp_dir().join(format!("iluha-remove-part-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let content = payload_bytes(512 * 1024);
    let (torrent_bytes, source_dir) =
        create_test_torrent("remove-part", &[("Episode 01.mkv", content)]);
    let (seeder, addr) = start_local_seeder(&dir, &torrent_bytes, &source_dir).await;
    seeder.ratelimits.set_upload_bps(NonZeroU32::new(64 * 1024));

    let manager = Arc::new(
        TorrentManager::new_test(dir.clone())
            .await
            .expect("session starts"),
    );
    let save_dir = dir.join("downloads");
    std::fs::create_dir_all(&save_dir).expect("create save dir");
    let existing = save_dir.join("Episode 01.mkv");
    std::fs::write(&existing, b"older file").expect("write the file that is already there");

    let id = download_from_local_seeder(&manager, torrent_bytes, &dir, addr, false).await;
    let part_path = part_file_path(&existing);
    let deadline = Instant::now() + Duration::from_secs(30);
    while Instant::now() < deadline && !part_path.is_file() {
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    assert!(part_path.is_file(), "the download goes to the .part twin");

    manager
        .remove_torrent(id, true, None)
        .await
        .expect("remove");
    assert!(
        !part_path.exists(),
        "the payload the engine wrote is deleted with the torrent"
    );
    assert!(
        existing.is_file(),
        "the file that was already there is not a payload of this torrent"
    );

    let _ = std::fs::remove_dir_all(&dir);
    let _ = std::fs::remove_dir_all(&source_dir);
}

#[tokio::test(flavor = "multi_thread")]
async fn partial_leftovers_are_listed_cleared_and_cannot_escape_the_save_dir() {
    let dir = std::env::temp_dir().join(format!("iluha-leftover-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let save_dir = dir.join("library");
    std::fs::create_dir_all(save_dir.join("Show")).expect("create save dir");
    let inside = save_dir.join("Show").join("Episode 01.mkv");
    std::fs::write(&inside, vec![7u8; 1024 * 1024]).expect("write partial");
    let outside = dir.join("escape.mkv");
    std::fs::write(&outside, b"keep me").expect("write outside");

    let manager = TorrentManager::new_test(dir.clone())
        .await
        .expect("session starts");
    let hash = "a".repeat(40);
    manager.registry.partial_leftovers.insert(
        hash.clone(),
        PartialLeftover {
            info_hash: hash,
            name: "Show".to_string(),
            save_dir: save_dir.to_string_lossy().to_string(),
            files: vec![
                PartialLeftoverFile {
                    name: "Show/Episode 01.mkv".to_string(),
                    size: 4 * 1024 * 1024,
                    on_disk_bytes: 1024 * 1024,
                },
                PartialLeftoverFile {
                    name: "../escape.mkv".to_string(),
                    size: 7,
                    on_disk_bytes: 7,
                },
            ],
            removed_at: 1,
        },
    );

    let listed = manager.list_partial_leftovers();
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].files.len(), 2);

    let freed = manager.clear_partial_leftovers(None);
    assert!(freed >= 1024 * 1024, "freed bytes are reported");
    assert!(!inside.exists(), "the recorded partial is deleted");
    assert!(!save_dir.join("Show").exists(), "empty parents are pruned");
    assert!(
        outside.exists(),
        "a traversal name must never delete outside"
    );
    assert!(manager.list_partial_leftovers().is_empty());

    manager.registry.partial_leftovers.insert(
        "b".repeat(40),
        PartialLeftover {
            info_hash: "b".repeat(40),
            name: "Gone".to_string(),
            save_dir: save_dir.to_string_lossy().to_string(),
            files: vec![PartialLeftoverFile {
                name: "Gone/missing.mkv".to_string(),
                size: 10,
                on_disk_bytes: 10,
            }],
            removed_at: 2,
        },
    );
    assert!(
        manager.list_partial_leftovers().is_empty(),
        "records whose files are gone prune themselves"
    );

    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test(flavor = "multi_thread")]
async fn keeping_files_drops_empty_placeholders_and_leaves_no_leftovers() {
    let dir = std::env::temp_dir().join(format!("iluha-placeholder-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let content = vec![7u8; 64 * 1024];
    let (torrent_bytes, source_dir) = create_test_torrent(
        "keep-placeholder",
        &[
            ("Show/Episode 01.mkv", content.clone()),
            ("Show/Episode 02.mkv", content),
        ],
    );
    let manager = Arc::new(
        TorrentManager::new_test(dir.clone())
            .await
            .expect("session starts"),
    );
    let save_dir = dir.join("library");
    let id = manager
        .add_torrent_from_bytes(
            torrent_bytes,
            save_dir.to_string_lossy().to_string(),
            Some(vec![0]),
            None,
            false,
        )
        .await
        .expect("add");
    let selected = part_file_path(&save_dir.join("Show/Episode 01.mkv"));
    let unselected = part_file_path(&save_dir.join("Show/Episode 02.mkv"));
    for _ in 0..100 {
        if selected.exists() && unselected.exists() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    assert!(
        selected.exists() && unselected.exists(),
        "the engine creates a .part path for every file during init"
    );
    assert_eq!(
        std::fs::metadata(&unselected).expect("metadata").len(),
        0,
        "the unselected file has to be a zero-byte placeholder"
    );

    manager
        .remove_torrent(id, false, None)
        .await
        .expect("remove keeping files");

    assert!(
        !selected.exists() && !unselected.exists(),
        "zero-byte placeholders carry no data and must not survive keep-files"
    );
    assert!(
        manager.list_partial_leftovers().is_empty(),
        "placeholders never enter the leftover record"
    );

    let _ = std::fs::remove_dir_all(&dir);
    let _ = std::fs::remove_dir_all(&source_dir);
}

#[tokio::test(flavor = "multi_thread")]
async fn keeping_files_records_part_partials_and_deletes_empty_placeholders() {
    let dir = std::env::temp_dir().join(format!("iluha-part-leftover-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let content = vec![7u8; 64 * 1024];
    let (torrent_bytes, source_dir) = create_test_torrent(
        "keep-partial",
        &[
            ("Show/Episode 01.mkv", content.clone()),
            ("Show/Episode 02.mkv", content),
        ],
    );
    let manager = Arc::new(
        TorrentManager::new_test(dir.clone())
            .await
            .expect("session starts"),
    );
    let save_dir = dir.join("library");
    let id = manager
        .add_torrent_from_bytes(
            torrent_bytes,
            save_dir.to_string_lossy().to_string(),
            Some(vec![0]),
            None,
            false,
        )
        .await
        .expect("add");
    let selected = part_file_path(&save_dir.join("Show/Episode 01.mkv"));
    let unselected = part_file_path(&save_dir.join("Show/Episode 02.mkv"));
    for _ in 0..100 {
        if selected.exists() && unselected.exists() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    assert!(
        selected.exists() && unselected.exists(),
        "init creates a .part path for every file"
    );
    // sync_all puts the bytes on the disk so the sparse allocation the
    // leftover record reports is real, not a dirty cache page.
    let mut partial = std::fs::File::create(&selected).expect("open partial");
    std::io::Write::write_all(&mut partial, &vec![9u8; 1024]).expect("simulated download");
    partial.sync_all().expect("flush partial");

    manager
        .remove_torrent(id, false, None)
        .await
        .expect("remove keeping files");

    assert!(selected.exists(), "a partial with data survives keep-files");
    assert!(
        !unselected.exists(),
        "the empty placeholder must not survive keep-files"
    );
    #[cfg(windows)]
    assert!(
        crate::torrent::disk::is_hidden(&selected),
        "a kept .part stays hidden, so only Settings > Torrents lists it"
    );
    let listed = manager.list_partial_leftovers();
    assert_eq!(listed.len(), 1, "the data-carrying partial is recorded");
    assert!(
        listed[0].files[0].name.ends_with("Episode 01.mkv.part"),
        "the record names the .part file that exists: {}",
        listed[0].files[0].name
    );

    let freed = manager.clear_partial_leftovers(None);
    assert!(freed >= 1024, "the partial bytes are reported as freed");
    assert!(
        !selected.exists(),
        "cleanup deletes the recorded .part file"
    );

    let _ = std::fs::remove_dir_all(&dir);
    let _ = std::fs::remove_dir_all(&source_dir);
}

#[cfg(windows)]
#[tokio::test(flavor = "multi_thread")]
async fn stale_hidden_files_are_revealed_unless_a_leftover_owns_them() {
    let dir = std::env::temp_dir().join(format!("iluha-hidden-sweep-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let save_dir = dir.join("library");
    std::fs::create_dir_all(save_dir.join("Show")).expect("create save dir");
    let stale = save_dir.join("Show/Episode 01.mkv");
    let kept = save_dir.join("Show/Episode 02.mkv");
    std::fs::write(&stale, vec![1u8; 4096]).expect("write stale");
    std::fs::write(&kept, vec![2u8; 4096]).expect("write kept");
    crate::torrent::disk::hide_file(&stale);
    crate::torrent::disk::hide_file(&kept);

    let stale_hash = "a".repeat(40);
    let kept_hash = "b".repeat(40);
    let save_dir_string = save_dir.to_string_lossy().to_string();
    std::fs::write(
        dir.join("hidden_files.json"),
        serde_json::json!({
            stale_hash.clone():
                [stale.to_string_lossy().to_string()],
            kept_hash.clone():
                [kept.to_string_lossy().to_string()],
        })
        .to_string(),
    )
    .expect("write hidden registry");
    std::fs::write(
        dir.join("partial_leftovers.json"),
        serde_json::json!({
            kept_hash.clone(): {
                "info_hash": kept_hash.clone(),
                "name": "Show",
                "save_dir": save_dir_string,
                "files": [{
                    "name": "Show/Episode 02.mkv",
                    "size": 8192,
                    "on_disk_bytes": 4096
                }],
                "removed_at": 1
            }
        })
        .to_string(),
    )
    .expect("write leftover registry");

    let manager = TorrentManager::new_test(dir.clone())
        .await
        .expect("session starts");

    assert!(
        !crate::torrent::disk::is_hidden(&stale),
        "a hidden file without a torrent or leftover record has to be revealed"
    );
    assert!(
        crate::torrent::disk::is_hidden(&kept),
        "a leftover record still owns its hidden payload"
    );
    let registry: std::collections::HashMap<String, Vec<String>> = serde_json::from_str(
        &std::fs::read_to_string(dir.join("hidden_files.json")).expect("read registry"),
    )
    .expect("parse registry");
    assert!(!registry.contains_key(&stale_hash));
    assert!(registry.contains_key(&kept_hash));
    assert!(manager.registry.hidden_paths.contains_key(&kept_hash));

    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test(flavor = "multi_thread")]
async fn a_paused_torrent_keeps_its_folder_watched() {
    let dir = std::env::temp_dir().join(format!("iluha-paused-folder-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let content = vec![7u8; 64 * 1024];
    let (torrent_bytes, source_dir) =
        create_test_torrent("paused-folder", &[("Episode 01.mkv", content)]);
    let manager = Arc::new(
        TorrentManager::new_test(dir.clone())
            .await
            .expect("session starts"),
    );
    let save_dir = dir.join("library");
    let id = manager
        .add_torrent_from_bytes(
            torrent_bytes,
            save_dir.to_string_lossy().to_string(),
            None,
            None,
            false,
        )
        .await
        .expect("add");
    let (roots, files) = manager.active_download_paths();
    assert!(
        roots.contains(&save_dir.to_string_lossy().to_string()),
        "a running download suppresses its folder events"
    );
    assert!(!files.is_empty());

    manager
        .pause_torrent(id, None)
        .await
        .expect("pause torrent");
    let (roots, files) = manager.active_download_paths();
    assert!(
        roots.is_empty() && files.is_empty(),
        "a paused torrent writes nothing and must not hide its folder from the watcher"
    );

    manager
        .remove_torrent(id, true, None)
        .await
        .expect("remove");
    let _ = std::fs::remove_dir_all(&dir);
    let _ = std::fs::remove_dir_all(&source_dir);
}

#[tokio::test(flavor = "multi_thread")]
async fn created_torrent_cache_keeps_only_the_newest_entries() {
    let dir = std::env::temp_dir().join(format!("iluha-created-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let manager = TorrentManager::new_test(dir.clone())
        .await
        .expect("session starts");
    for index in 0..25u64 {
        let path = manager.created_dir.join(format!("{index:040}.torrent"));
        std::fs::write(&path, b"x").expect("write torrent");
        let stamp = std::time::UNIX_EPOCH + std::time::Duration::from_secs(index);
        let file = std::fs::File::options()
            .write(true)
            .open(&path)
            .expect("open torrent");
        file.set_modified(stamp).expect("set mtime");
    }

    manager.prune_created_torrents();

    let mut kept: Vec<String> = std::fs::read_dir(&manager.created_dir)
        .expect("read cache")
        .flatten()
        .filter_map(|entry| entry.file_name().into_string().ok())
        .collect();
    kept.sort();
    assert_eq!(kept.len(), 20);
    let indices: Vec<u64> = kept
        .iter()
        .filter_map(|name| name.trim_end_matches(".torrent").parse::<u64>().ok())
        .collect();
    assert!(indices.contains(&24), "the newest entry survives");
    assert!(!indices.contains(&0), "the oldest entries are pruned");

    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test(flavor = "multi_thread")]
async fn conflict_detection_uses_the_path_librqbit_actually_writes() {
    let dir = std::env::temp_dir().join(format!("iluha-conflict-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let (bytes, source_dir) = create_test_torrent(
        "conflict",
        &[
            ("Show/Episode 01.mkv", b"one".to_vec()),
            ("Show/Episode 02.mkv", b"two".to_vec()),
        ],
    );
    let manager = Arc::new(
        TorrentManager::new_test(dir.clone())
            .await
            .expect("session starts"),
    );
    let save_dir = dir.join("library").to_string_lossy().to_string();
    let preview = manager
        .get_torrent_info_from_bytes(bytes.clone(), save_dir.clone())
        .await
        .expect("preview");
    assert!(
        preview.has_common_folder,
        "the fixture has to exercise the common-folder branch"
    );
    assert!(preview.conflicting_files.is_empty());

    let actual = std::path::Path::new(&save_dir).join(&preview.files[0].name);
    std::fs::create_dir_all(actual.parent().expect("parent")).expect("create dir");
    std::fs::write(&actual, b"already here").expect("write conflict");

    let preview = manager
        .get_torrent_info_from_bytes(bytes, save_dir)
        .await
        .expect("preview again");
    assert_eq!(
        preview.conflicting_files,
        vec![preview.files[0].name.clone()],
        "the overwrite prompt has to see the file at its real path"
    );

    let _ = std::fs::remove_dir_all(&dir);
    let _ = std::fs::remove_dir_all(&source_dir);
}

/// Real-network check against a public magnet. Ignored by default because
/// it needs a working tracker/DHT and peers.
///
/// `cargo test --manifest-path src-tauri/Cargo.toml --lib real_magnet -- --ignored --nocapture`
#[tokio::test(flavor = "multi_thread")]
#[ignore = "real network: needs a tracker and peers"]
async fn real_magnet_download_keeps_part_files_and_records_leftovers() {
    const MAGNET: &str = "magnet:?xt=urn:btih:1ae788229e033e8c7a3023a66e76bd196058f226&dn=Yani+Neko+%5BWEB-DL+1080p%5D&tr=http%3A%2F%2Fbt4.t-ru.org%2Fann";
    let dir = std::env::temp_dir().join(format!("iluha-real-magnet-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let save_dir = dir.join("library");
    std::fs::create_dir_all(&save_dir).expect("create save dir");

    let manager = Arc::new(
        TorrentManager::new_test(dir.clone())
            .await
            .expect("session starts"),
    );
    let id = manager
        .add_torrent(
            MAGNET.to_string(),
            save_dir.to_string_lossy().to_string(),
            None,
            None,
            false,
        )
        .await
        .expect("the magnet has to resolve and add");

    let deadline = Instant::now() + Duration::from_secs(180);
    let mut partial = None;
    while Instant::now() < deadline {
        if let Ok(files) = manager.get_running_torrent_files(id) {
            if let Some(file) = files
                .iter()
                .find(|file| file.size > 0 && file.progress_bytes > 0 && !file.completed)
            {
                partial = Some(file.clone());
                break;
            }
        }
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
    let partial = partial.expect("no payload arrived in 180s: tracker, DHT or peers unavailable");

    manager.finalize_part_files_pass();
    let final_path = save_dir.join(&partial.name);
    let part_path = part_file_path(&final_path);
    assert!(
        part_path.exists(),
        "the partial payload has to exist on disk"
    );
    assert!(
        !final_path.exists(),
        "an incomplete payload must not appear under its final name"
    );
    assert!(
        !crate::torrent::disk::is_hidden(&part_path),
        "a .part payload needs no hidden attribute"
    );
    if manager.sparse_capable(&save_dir.to_string_lossy()) == Some(true) {
        assert!(
            partial.on_disk_bytes < partial.size,
            "sparse allocation has to track progress: {} of {} at {}",
            partial.on_disk_bytes,
            partial.size,
            partial.progress_bytes
        );
    }

    manager
        .remove_torrent(id, false, None)
        .await
        .expect("remove keeping files");
    let leftovers = manager.list_partial_leftovers();
    assert_eq!(leftovers.len(), 1, "keeping files records the partial");
    assert!(
        leftovers[0]
            .files
            .iter()
            .any(|file| file.name == format!("{}.part", partial.name)),
        "the recorded leftover has to include the .part payload"
    );

    let freed = manager.clear_partial_leftovers(None);
    assert!(freed > 0, "cleanup reports the reclaimed bytes");
    assert!(!part_path.exists(), "cleanup deletes the recorded partial");
    assert!(manager.list_partial_leftovers().is_empty());

    let _ = std::fs::remove_dir_all(&dir);
}
