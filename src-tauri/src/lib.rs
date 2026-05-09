use scraper::{Html, Selector};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::num::NonZeroU32;
use std::sync::Arc;
use tauri::{Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

mod torrent;
use torrent::{TorrentFileInfo, TorrentInfoResult, TorrentManager, TorrentInfo};

#[derive(Debug, Serialize)]
pub struct NyaaItem {
    pub title: String,
    pub magnet: String,
    pub torrent: String,
    pub size: String,
    pub seeders: u32,
    pub leechers: u32,
    pub category: String,
    pub link: String,
}

fn build_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Client error: {e}"))
}

#[tauri::command]
async fn search_erairaws(query: String) -> Result<Vec<NyaaItem>, String> {
    let client = build_client()?;

    let resp = client
        .get("https://animetosho.org/search")
        .query(&[("q", format!("{} erai-raws", query))])
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Search page returned HTTP {}", resp.status()));
    }

    let html = resp.text().await.map_err(|e| format!("Read error: {e}"))?;
    Ok(parse_entries(&html))
}

fn parse_entries(html: &str) -> Vec<NyaaItem> {
    let doc = Html::parse_document(html);
    let entry_sel = Selector::parse(".home_list_entry").unwrap();
    let link_sel = Selector::parse(".link > a").unwrap();
    let size_sel = Selector::parse(".size").unwrap();
    let a_sel = Selector::parse("a").unwrap();
    let span_sel = Selector::parse("span[title]").unwrap();

    let mut items = Vec::new();

    for entry in doc.select(&entry_sel) {
        let title = entry
            .select(&link_sel)
            .next()
            .map(|a| a.text().collect::<String>().trim().to_string())
            .unwrap_or_default();

        if !title.to_lowercase().contains("erai-raws") {
            continue;
        }

        let size = entry
            .select(&size_sel)
            .next()
            .map(|s| s.text().collect::<String>().trim().to_string())
            .unwrap_or_default();

        let mut magnet = String::new();
        let mut torrent = String::new();
        let mut link = String::new();

        for a in entry.select(&a_sel) {
            if let Some(h) = a.value().attr("href") {
                if h.starts_with("magnet:") && magnet.is_empty() {
                    magnet = h.to_string();
                } else if h.ends_with(".torrent") && torrent.is_empty() {
                    torrent = if h.starts_with("http") {
                        h.to_string()
                    } else {
                        format!("https://animetosho.org{h}")
                    };
                } else if a.value().attr("class").map_or(false, |c| c == "website") && link.is_empty() {
                    link = h.to_string();
                }
            }
        }

        let sealee = entry
            .select(&span_sel)
            .next()
            .and_then(|s| s.value().attr("title"))
            .unwrap_or("")
            .to_string();

        let (seeders, leechers) = parse_seeders_leechers(&sealee);

        items.push(NyaaItem {
            title,
            magnet,
            torrent,
            size,
            seeders,
            leechers,
            category: String::new(),
            link,
        });
    }

    items
}

fn parse_seeders_leechers(s: &str) -> (u32, u32) {
    let re = regex_lite::Regex::new(r"Seeders:\s*(\d+)\s*/\s*Leechers:\s*(\d+)").ok();
    match re.and_then(|r| r.captures(s)) {
        Some(c) => (
            c.get(1).and_then(|m| m.as_str().parse().ok()).unwrap_or(0),
            c.get(2).and_then(|m| m.as_str().parse().ok()).unwrap_or(0),
        ),
        None => (0, 0),
    }
}

#[tauri::command]
async fn search_nyaa(query: String) -> Result<Vec<NyaaItem>, String> {
    let client = build_client()?;

    let resp = client
        .get("https://nyaa.si/")
        .query(&[("q", &*query), ("s", "seeders"), ("o", "desc")])
        .send()
        .await
        .map_err(|e| format!("Nyaa request failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Nyaa search returned HTTP {}", resp.status()));
    }

    let html = resp.text().await.map_err(|e| format!("Read error: {e}"))?;
    let items = parse_nyaa_entries(&html);
    Ok(items.into_iter().filter(has_russian_subs).collect())
}

fn has_russian_subs(item: &NyaaItem) -> bool {
    let upper = item.title.to_uppercase();
    upper.contains("[RUS]")
        || upper.contains("(RUS)")
        || upper.contains("[RU]")
        || upper.contains("(RU)")
        || upper.contains("ANIMERUS")
        || upper.contains("ANIRUS")
        || upper.contains("SUBRUS")
        || item.title.contains("рус")
        || item.title.contains("Рус")
        || item.title.contains("РУС")
}

fn parse_nyaa_entries(html: &str) -> Vec<NyaaItem> {
    let doc = Html::parse_document(html);
    let row_sel = Selector::parse("table tbody tr").unwrap();
    let td_sel = Selector::parse("td").unwrap();
    let title_link_sel = Selector::parse("a[title]").unwrap();
    let magnet_sel = Selector::parse("a[href^='magnet:']").unwrap();
    let download_sel = Selector::parse("a[href*='/download/']").unwrap();

    let mut items = Vec::new();

    for row in doc.select(&row_sel) {
        let tds: Vec<_> = row.select(&td_sel).collect();
        if tds.len() < 8 {
            continue;
        }

        let title = tds[1]
            .select(&title_link_sel)
            .next()
            .and_then(|a| a.value().attr("title"))
            .map(|s| s.to_string())
            .unwrap_or_default();

        if title.is_empty() {
            continue;
        }

        let magnet = tds[2]
            .select(&magnet_sel)
            .next()
            .and_then(|a| a.value().attr("href"))
            .map(|s| s.to_string())
            .unwrap_or_default();

        let torrent = tds[2]
            .select(&download_sel)
            .next()
            .and_then(|a| a.value().attr("href"))
            .map(|s| format!("https://nyaa.si{s}"))
            .unwrap_or_default();

        let size = tds[3].text().collect::<String>().trim().to_string();
        let seeders = tds[5].text().collect::<String>().trim().parse().unwrap_or(0);
        let leechers = tds[6].text().collect::<String>().trim().parse().unwrap_or(0);

        items.push(NyaaItem {
            title,
            magnet,
            torrent,
            size,
            seeders,
            leechers,
            category: String::new(),
            link: String::new(),
        });
    }

    items
}

#[tauri::command]
async fn start_torrent_download(
    magnet: String,
    save_dir: String,
    only_files: Option<Vec<usize>>,
    sub_folder: Option<String>,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<usize, String> {
    manager
        .manager
        .add_torrent(magnet, save_dir, only_files, sub_folder)
        .await
        .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
async fn get_torrent_info(
    magnet: String,
    save_dir: String,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<TorrentInfoResult, String> {
    manager.manager.get_torrent_info(magnet, save_dir).await
}

#[tauri::command]
fn list_torrents(
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<Vec<TorrentInfo>, String> {
    Ok(manager.manager.collect_torrents())
}

#[tauri::command]
async fn pause_torrent(
    id: usize,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<(), String> {
    manager
        .manager
        .pause_torrent(id)
        .await
        .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
async fn resume_torrent(
    id: usize,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<(), String> {
    manager
        .manager
        .resume_torrent(id)
        .await
        .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
async fn remove_torrent(
    id: usize,
    delete_files: bool,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<(), String> {
    manager
        .manager
        .remove_torrent(id, delete_files)
        .await
        .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
fn get_app_data_path(app_handle: tauri::AppHandle) -> Result<String, String> {
    let dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create dir: {e}"))?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, &content).map_err(|e| format!("Write error: {e}"))
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Read error: {e}"))
}

#[tauri::command]
fn set_global_speed_limits(
    download_bps: Option<u32>,
    upload_bps: Option<u32>,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<(), String> {
    manager.manager.set_global_limits(
        download_bps.and_then(NonZeroU32::new),
        upload_bps.and_then(NonZeroU32::new),
    );
    Ok(())
}

#[tauri::command]
fn get_running_torrent_files(
    id: usize,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<Vec<TorrentFileInfo>, String> {
    manager.manager.get_running_torrent_files(id)
}

#[tauri::command]
async fn update_torrent_only_files(
    id: usize,
    only_files: Vec<usize>,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<(), String> {
    manager
        .manager
        .update_torrent_only_files(id, only_files)
        .await
}

struct TorrentBackend {
    manager: Arc<TorrentManager>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let app_data = app.path().app_data_dir().expect("app data dir");
            let handle = app.handle().clone();
            tauri::async_runtime::block_on(async {
                let manager = TorrentManager::new(app_data)
                    .await
                    .expect("failed to initialize torrent session");
                let manager = Arc::new(manager);
                let app_clone = handle.clone();
                let mgr_clone = manager.clone();
                tokio::spawn(async move {
                    let mut prev_states: HashMap<usize, (bool, Option<String>)> = HashMap::new();
                    loop {
                        tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                        let torrents = mgr_clone.collect_torrents();
                        let _ = app_clone.emit("torrents-update", &torrents);

                        for t in &torrents {
                            let prev = prev_states.get(&t.id);
                            let prev_finished = prev.map(|(f, _)| *f).unwrap_or(false);
                            let prev_error = prev.and_then(|(_, e)| e.clone());

                            if t.finished && !prev_finished && t.total_bytes > 0 {
                                let _ = app_clone
                                    .notification()
                                    .builder()
                                    .title("Загрузка завершена")
                                    .body(&t.name)
                                    .show();
                            }

                            if t.error.is_some() && prev_error.is_none() {
                                let msg = format!("{}: {}", t.name, t.error.as_deref().unwrap_or(""));
                                let _ = app_clone
                                    .notification()
                                    .builder()
                                    .title("Ошибка загрузки")
                                    .body(&msg)
                                    .show();
                            }

                            prev_states.insert(t.id, (t.finished, t.error.clone()));
                        }

                        let current_ids: HashSet<usize> =
                            torrents.iter().map(|t| t.id).collect();
                        prev_states.retain(|id, _| current_ids.contains(id));
                    }
                });
                handle.manage(TorrentBackend { manager });
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            search_erairaws,
            search_nyaa,
            start_torrent_download,
            list_torrents,
            pause_torrent,
            resume_torrent,
            remove_torrent,
            get_app_data_path,
            write_text_file,
            read_text_file,
            get_torrent_info,
            get_running_torrent_files,
            update_torrent_only_files,
            set_global_speed_limits,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
