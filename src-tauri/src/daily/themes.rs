use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use futures::StreamExt;
use reqwest::Client;
use serde::Deserialize;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

use crate::scrapers::clients::read_body_capped;

use super::pool::PoolEntry;
use super::types::DailyMode;

const GRAPHQL_ENDPOINT: &str = "https://graphql.animethemes.moe/";
const MAX_VIDEO_BYTES: usize = 100 * 1024 * 1024;
const MAX_GRAPHQL_BYTES: usize = 2 * 1024 * 1024;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(150);
const CACHE_DIR: &str = "daily-clips";
const PROGRESS_STEP_BYTES: usize = 512 * 1024;
const AUDIO_SECONDS: f64 = 15.0;
const PROBE_TIMEOUT: Duration = Duration::from_secs(20);
const CUT_TIMEOUT: Duration = Duration::from_secs(90);

const QUERY: &str = "query($mal: [Int!]!) {
  findAnimeByExternalSite(site: MAL, id: $mal) {
    animethemes {
      slug
      type
      song { title { romaji native } }
      animethemeentries {
        nsfw
        spoiler
        videos { nodes { link resolution size mimetype } }
      }
    }
  }
}";

#[derive(Deserialize)]
struct GqlResponse {
    data: Option<GqlData>,
    #[serde(default)]
    errors: Vec<GqlError>,
}

#[derive(Deserialize)]
struct GqlError {
    message: String,
}

#[derive(Deserialize)]
struct GqlData {
    #[serde(rename = "findAnimeByExternalSite")]
    found: Vec<AnimeNode>,
}

#[derive(Deserialize)]
struct AnimeNode {
    #[serde(default)]
    animethemes: Vec<ThemeNode>,
}

#[derive(Deserialize)]
struct ThemeNode {
    slug: String,
    #[serde(rename = "type")]
    theme_type: String,
    song: Option<SongNode>,
    #[serde(default)]
    animethemeentries: Vec<EntryNode>,
}

#[derive(Deserialize)]
struct SongNode {
    title: Option<SongTitleNode>,
}

#[derive(Deserialize)]
struct SongTitleNode {
    romaji: Option<String>,
    native: Option<String>,
}

#[derive(Deserialize)]
struct EntryNode {
    #[serde(default)]
    nsfw: bool,
    #[serde(default)]
    spoiler: bool,
    videos: Option<VideoConnection>,
}

#[derive(Deserialize)]
struct VideoConnection {
    #[serde(default)]
    nodes: Vec<VideoNode>,
}

#[derive(Deserialize)]
struct VideoNode {
    link: String,
    #[serde(default)]
    resolution: i32,
    #[serde(default)]
    size: i64,
    mimetype: Option<String>,
}

#[derive(Debug)]
struct SelectedTheme {
    slug: String,
    theme_type: String,
    title: String,
    video_link: String,
    resolution: i32,
    size: i64,
}

pub struct ThemeClip {
    pub theme_type: String,
    pub theme_title: String,
    pub path: String,
    pub start_fraction: f64,
}

/// Byte progress of the clip download, so the mode card can show a bar while
/// the video file is being fetched. It never carries a title or a URL.
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ClipProgress<'a> {
    day: &'a str,
    mode: DailyMode,
    received: u64,
    total: u64,
}

fn client(proxy: Option<&str>) -> Result<Client, String> {
    let mut builder = Client::builder()
        .user_agent(format!(
            "iluhaAnime/{} (desktop client)",
            env!("CARGO_PKG_VERSION")
        ))
        .timeout(REQUEST_TIMEOUT);
    if let Some(proxy) = proxy {
        builder = builder
            .proxy(reqwest::Proxy::all(proxy).map_err(|error| format!("themes proxy: {error}"))?);
    }
    builder
        .build()
        .map_err(|error| format!("themes client: {error}"))
}

fn is_video_url(raw: &str) -> bool {
    let Ok(url) = reqwest::Url::parse(raw.trim()) else {
        return false;
    };
    if url.scheme() != "https" {
        return false;
    }
    let Some(host) = url.host_str() else {
        return false;
    };
    if host != "animethemes.moe" && !host.ends_with(".animethemes.moe") {
        return false;
    }
    let path = url.path().to_ascii_lowercase();
    path.ends_with(".webm") || path.ends_with(".mp4")
}

fn is_video_mimetype(value: Option<&str>) -> bool {
    value
        .map(|kind| kind.to_ascii_lowercase().starts_with("video/"))
        .unwrap_or(true)
}

/// Prefer 480p, then 720p, then 1080p, and the smallest file within a bucket.
/// The clip is downloaded before it plays, so a smaller copy matters more than
/// a sharper one.
fn resolution_preference(resolution: i32) -> u8 {
    match resolution {
        0..=480 => 0,
        481..=720 => 1,
        721..=1080 => 2,
        _ => 3,
    }
}

fn video_rank(video: &VideoNode) -> (u8, i64) {
    (resolution_preference(video.resolution), video.size)
}

fn best_video(theme: &ThemeNode) -> Option<&VideoNode> {
    theme
        .animethemeentries
        .iter()
        .filter(|entry| !entry.nsfw && !entry.spoiler)
        .filter_map(|entry| entry.videos.as_ref())
        .flat_map(|videos| videos.nodes.iter())
        .filter(|video| {
            is_video_url(&video.link)
                && is_video_mimetype(video.mimetype.as_deref())
                && video.size > 0
                && video.size as usize <= MAX_VIDEO_BYTES
        })
        .min_by_key(|video| video_rank(video))
}

fn select_theme(found: &[AnimeNode], seed: u64, opening_only: bool) -> Option<SelectedTheme> {
    let mut themes: Vec<SelectedTheme> = found
        .iter()
        .flat_map(|anime| anime.animethemes.iter())
        .filter(|theme| theme.theme_type == "OP" || (!opening_only && theme.theme_type == "ED"))
        .filter_map(|theme| {
            let video = best_video(theme)?;
            Some(SelectedTheme {
                slug: theme.slug.clone(),
                theme_type: theme.theme_type.clone(),
                title: theme
                    .song
                    .as_ref()
                    .and_then(|song| song.title.as_ref())
                    .and_then(|title| {
                        title
                            .romaji
                            .clone()
                            .filter(|value| !value.trim().is_empty())
                            .or_else(|| title.native.clone())
                    })
                    .unwrap_or_default(),
                video_link: video.link.clone(),
                resolution: video.resolution,
                size: video.size,
            })
        })
        .collect();
    if themes.is_empty() {
        return None;
    }
    // Openings first so the mode reads as an opening guess; endings stay as the
    // fallback when a title has no OP video.
    themes.sort_by(|left, right| {
        let left_op = left.theme_type == "OP";
        let right_op = right.theme_type == "OP";
        right_op
            .cmp(&left_op)
            .then_with(|| {
                resolution_preference(left.resolution).cmp(&resolution_preference(right.resolution))
            })
            .then_with(|| left.size.cmp(&right.size))
            .then_with(|| left.slug.cmp(&right.slug))
    });
    // 70% openings, 30% endings when both exist; a title with only one type
    // still resolves instead of failing the day.
    let (openings, endings): (Vec<SelectedTheme>, Vec<SelectedTheme>) = themes
        .into_iter()
        .partition(|theme| theme.theme_type == "OP");
    let mut pool = if openings.is_empty() {
        endings
    } else if endings.is_empty() || seed % 100 < 70 {
        openings
    } else {
        endings
    };
    let index = ((seed >> 8) as usize) % pool.len();
    Some(pool.swap_remove(index))
}

async fn fetch_anime(mal_id: i64, proxy: Option<&str>) -> Result<Vec<AnimeNode>, String> {
    if mal_id <= 0 {
        return Err("daily candidate has no MAL id".into());
    }
    let body = serde_json::json!({
        "query": QUERY,
        "variables": { "mal": [mal_id] },
    });
    let response = client(proxy)?
        .post(GRAPHQL_ENDPOINT)
        .json(&body)
        .send()
        .await
        .map_err(|error| format!("animethemes request: {error}"))?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("animethemes answered {status}"));
    }
    let bytes = read_body_capped(response, MAX_GRAPHQL_BYTES)
        .await
        .map_err(|error| format!("animethemes body: {error:?}"))?;
    let parsed: GqlResponse =
        serde_json::from_slice(&bytes).map_err(|error| format!("animethemes parse: {error}"))?;
    if !parsed.errors.is_empty() {
        let messages: Vec<&str> = parsed
            .errors
            .iter()
            .map(|error| error.message.as_str())
            .collect();
        return Err(format!("animethemes: {}", messages.join("; ")));
    }
    parsed
        .data
        .map(|data| data.found)
        .ok_or_else(|| "animethemes returned no data".to_string())
}

async fn download_video(
    url: &str,
    proxy: Option<&str>,
    fallback_total: i64,
    on_progress: impl Fn(u64, u64),
) -> Result<Vec<u8>, String> {
    if !is_video_url(url) {
        return Err("animethemes video url is not allowed".into());
    }
    let response = client(proxy)?
        .get(url)
        .header(reqwest::header::REFERER, "https://animethemes.moe/")
        .send()
        .await
        .map_err(|error| format!("theme download: {error}"))?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("video host answered {status}"));
    }
    if !is_video_url(response.url().as_str()) {
        return Err("video host redirected outside the allowlist".into());
    }
    if let Some(kind) = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
    {
        if !kind.to_ascii_lowercase().starts_with("video/") {
            return Err(format!("video host returned {kind}"));
        }
    }
    let total = response
        .headers()
        .get(reqwest::header::CONTENT_LENGTH)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u64>().ok())
        .filter(|value| *value > 0)
        .or_else(|| {
            u64::try_from(fallback_total)
                .ok()
                .filter(|value| *value > 0)
        })
        .unwrap_or(0);
    if total > 0 {
        on_progress(0, total);
    }

    let mut bytes = Vec::new();
    let mut last_report = 0usize;
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| format!("video body: {error}"))?;
        if bytes.len().saturating_add(chunk.len()) > MAX_VIDEO_BYTES {
            return Err("video body: response is too large".into());
        }
        bytes.extend_from_slice(&chunk);
        if total > 0
            && (bytes.len() as u64 >= total || bytes.len() - last_report >= PROGRESS_STEP_BYTES)
        {
            last_report = bytes.len();
            on_progress(bytes.len() as u64, total);
        }
    }
    if total > 0 {
        on_progress(bytes.len() as u64, total.max(bytes.len() as u64));
    }
    Ok(bytes)
}

fn day_key(day: &str) -> String {
    let mut hasher = DefaultHasher::new();
    day.hash(&mut hasher);
    format!("{:08x}", hasher.finish())
}

fn opaque_name(day: &str, media_id: i64, slug: &str) -> String {
    let mut hasher = DefaultHasher::new();
    day.hash(&mut hasher);
    media_id.hash(&mut hasher);
    slug.hash(&mut hasher);
    format!("clip-{}-{:016x}", day_key(day), hasher.finish())
}

fn cache_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|error| format!("clip cache dir: {error}"))?
        .join(CACHE_DIR);
    std::fs::create_dir_all(&dir).map_err(|error| format!("create clip cache dir: {error}"))?;
    Ok(dir)
}

fn extension_from_url(url: &str) -> String {
    PathBuf::from(url)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("webm")
        .to_ascii_lowercase()
}

fn clip_target(
    app: &AppHandle,
    day: &str,
    media_id: i64,
    slug: &str,
    extension: &str,
) -> Result<PathBuf, String> {
    let dir = cache_dir(app)?;
    // OP and audio can both need a clip today, so only drop other days' files.
    let day_prefix = format!("clip-{}-", day_key(day));
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let current_day = path
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with(&day_prefix));
            if path.is_file() && !current_day {
                let _ = std::fs::remove_file(path);
            }
        }
    }
    Ok(dir.join(format!("{}.{extension}", opaque_name(day, media_id, slug))))
}

fn full_clip_pathbuf(segment: &Path) -> PathBuf {
    let extension = segment
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("webm");
    let stem = segment
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("clip");
    segment.with_file_name(format!("{stem}.full.{extension}"))
}

/// The result screen replays the whole video; the cut only covers the round.
/// The background download lands next to the segment with the same day prefix.
pub fn full_clip_path(segment: &str) -> String {
    if segment.is_empty() {
        return String::new();
    }
    full_clip_pathbuf(Path::new(segment))
        .to_string_lossy()
        .into_owned()
}

fn audio_window_start(duration: f64, fraction: f64) -> f64 {
    let minimum = duration * 0.15;
    let maximum = (duration * 0.92 - AUDIO_SECONDS).max(minimum);
    (duration * fraction)
        .clamp(minimum, maximum)
        .min((duration - AUDIO_SECONDS).max(0.0))
}

async fn remote_duration(app: &AppHandle, url: &str) -> Result<f64, String> {
    let mut command = Command::new(crate::video::ffprobe_exe(app));
    command
        .args([
            "-v",
            "error",
            "-headers",
            "Referer: https://animethemes.moe/\r\n",
            "-show_entries",
            "format=duration",
            "-of",
            "default=nw=1:nk=1",
            url,
        ])
        .kill_on_drop(true);
    let output = tokio::time::timeout(PROBE_TIMEOUT, command.output())
        .await
        .map_err(|_| "ffprobe timed out".to_string())?
        .map_err(|error| format!("ffprobe: {error}"))?;
    if !output.status.success() {
        return Err("ffprobe could not read the clip duration".into());
    }
    let duration = String::from_utf8_lossy(&output.stdout)
        .trim()
        .parse::<f64>()
        .map_err(|error| format!("ffprobe duration: {error}"))?;
    if duration <= 1.0 {
        return Err("the clip is too short".into());
    }
    Ok(duration)
}

fn part_clip_path(target: &Path) -> PathBuf {
    let extension = target
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("webm");
    let stem = target
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("clip");
    target.with_file_name(format!("{stem}.part.{extension}"))
}

async fn cut_audio_segment(
    app: &AppHandle,
    url: &str,
    fraction: f64,
    target: &Path,
    expected_bytes: i64,
    on_progress: impl Fn(u64, u64),
) -> Result<(), String> {
    let duration = remote_duration(app, url).await?;
    let expected = ((expected_bytes.max(1) as f64) * AUDIO_SECONDS / duration).max(1.0) as u64;
    let start = audio_window_start(duration, fraction);
    let part = part_clip_path(target);
    let _ = std::fs::remove_file(&part);
    let mut command = Command::new(crate::video::ffmpeg_exe(app));
    command
        .args([
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-headers",
            "Referer: https://animethemes.moe/\r\n",
            "-ss",
            &format!("{start:.3}"),
            "-i",
            url,
            "-t",
            "15",
            "-c",
            "copy",
            "-avoid_negative_ts",
            "make_zero",
            "-progress",
            "pipe:1",
            "-nostats",
            part.to_string_lossy().as_ref(),
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true);
    let mut child = command
        .spawn()
        .map_err(|error| format!("ffmpeg: {error}"))?;
    let Some(stdout) = child.stdout.take() else {
        return Err("ffmpeg produced no progress stream".into());
    };
    let mut lines = BufReader::new(stdout).lines();
    let result = tokio::time::timeout(CUT_TIMEOUT, async {
        while let Some(line) = lines
            .next_line()
            .await
            .map_err(|error| format!("ffmpeg progress: {error}"))?
        {
            if let Some(value) = line.strip_prefix("total_size=") {
                if let Ok(bytes) = value.trim().parse::<u64>() {
                    on_progress(bytes.min(expected), expected);
                }
            }
        }
        child
            .wait()
            .await
            .map_err(|error| format!("ffmpeg: {error}"))
    })
    .await;
    match result {
        Ok(Ok(status)) if status.success() => match std::fs::metadata(&part) {
            Ok(meta) if meta.len() > 0 => {
                std::fs::rename(&part, target).map_err(|error| format!("write clip: {error}"))
            }
            _ => {
                let _ = std::fs::remove_file(&part);
                Err("ffmpeg produced an empty clip".into())
            }
        },
        Ok(Ok(status)) => {
            let _ = std::fs::remove_file(&part);
            Err(format!("ffmpeg exited with {status}"))
        }
        Ok(Err(error)) => {
            let _ = std::fs::remove_file(&part);
            Err(error)
        }
        Err(_) => {
            let _ = std::fs::remove_file(&part);
            Err("ffmpeg cut timed out".into())
        }
    }
}

fn spawn_full_clip(url: String, target: PathBuf) {
    tokio::spawn(async move {
        if target.is_file() {
            return;
        }
        let part = target.with_extension("part");
        match download_video(&url, None, 0, |_, _| {}).await {
            Ok(bytes) => {
                if let Err(error) = tokio::fs::write(&part, &bytes).await {
                    tracing::warn!(error = %error, "daily full clip write failed");
                    let _ = tokio::fs::remove_file(&part).await;
                    return;
                }
                if let Err(error) = tokio::fs::rename(&part, &target).await {
                    tracing::warn!(error = %error, "daily full clip rename failed");
                    let _ = tokio::fs::remove_file(&part).await;
                }
            }
            Err(error) => tracing::warn!(error = error.as_str(), "daily full clip download failed"),
        }
    });
}

fn start_fraction(seed: u64, opening_only: bool) -> f64 {
    if opening_only {
        0.08 + super::sources::unit(seed, 4, 19) * 0.30
    } else {
        0.25 + super::sources::unit(seed, 3, 17) * 0.45
    }
}

pub async fn prepare_clip(
    app: &AppHandle,
    day: &str,
    entry: &PoolEntry,
    seed: u64,
    proxy: Option<&str>,
    mode: DailyMode,
) -> Result<ThemeClip, String> {
    let opening_only = mode == DailyMode::Audio;
    let found = fetch_anime(entry.mal_id, proxy).await?;
    let theme = select_theme(&found, seed, opening_only)
        .ok_or_else(|| format!("no usable theme for {}", entry.title))?;
    tracing::info!(
        media_id = entry.media_id,
        theme = theme.slug.as_str(),
        resolution = theme.resolution,
        size = theme.size,
        "preparing daily op clip"
    );
    let extension = extension_from_url(&theme.video_link);
    let target = clip_target(app, day, entry.media_id, &theme.slug, &extension)?;
    let fraction = start_fraction(seed, opening_only);
    let progress = |received: u64, total: u64| {
        let _ = app.emit(
            "daily-clip-progress",
            ClipProgress {
                day,
                mode,
                received,
                total,
            },
        );
    };
    if mode == DailyMode::Audio && proxy.is_none() {
        match cut_audio_segment(
            app,
            &theme.video_link,
            fraction,
            &target,
            theme.size,
            &progress,
        )
        .await
        {
            Ok(()) => {
                spawn_full_clip(theme.video_link.clone(), full_clip_pathbuf(&target));
                return Ok(ThemeClip {
                    theme_type: theme.theme_type,
                    theme_title: theme.title,
                    path: target.to_string_lossy().into_owned(),
                    start_fraction: fraction,
                });
            }
            Err(error) => tracing::warn!(
                media_id = entry.media_id,
                error = error.as_str(),
                "daily audio cut failed, downloading the full clip"
            ),
        }
    }
    let bytes = download_video(&theme.video_link, proxy, theme.size, &progress).await?;
    std::fs::write(&target, &bytes).map_err(|error| format!("write clip: {error}"))?;
    Ok(ThemeClip {
        theme_type: theme.theme_type,
        theme_title: theme.title,
        path: target.to_string_lossy().into_owned(),
        start_fraction: fraction,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> Vec<AnimeNode> {
        serde_json::from_str(
            r#"[
              {
                "animethemes": [
                  {
                    "slug": "test-ED1",
                    "type": "ED",
                    "song": { "title": { "romaji": "Ending Song" } },
                    "animethemeentries": [
                      { "nsfw": false, "spoiler": false, "videos": { "nodes": [
                        { "link": "https://v.animethemes.moe/Test-ED1.webm", "resolution": 720, "size": 20971520, "mimetype": "video/webm" }
                      ] } }
                    ]
                  },
                  {
                    "slug": "test-OP1",
                    "type": "OP",
                    "song": { "title": { "romaji": "Opening Song", "native": null } },
                    "animethemeentries": [
                      { "nsfw": false, "spoiler": false, "videos": { "nodes": [
                        { "link": "https://v.animethemes.moe/Test-OP1-1080.webm", "resolution": 1080, "size": 52428800, "mimetype": "video/webm" },
                        { "link": "https://v.animethemes.moe/Test-OP1-480.webm", "resolution": 480, "size": 15728640, "mimetype": "video/webm" },
                        { "link": "https://v.animethemes.moe/Test-OP1-720.webm", "resolution": 720, "size": 31457280, "mimetype": "video/webm" }
                      ] } }
                    ]
                  }
                ]
              }
            ]"#,
        )
        .expect("fixture")
    }

    #[test]
    fn openings_win_and_the_smallest_copy_is_picked() {
        let theme = select_theme(&fixture(), 42, false).expect("theme");
        assert_eq!(theme.theme_type, "OP");
        assert_eq!(theme.title, "Opening Song");
        assert!(theme.video_link.ends_with("Test-OP1-480.webm"));
    }

    #[test]
    fn the_audio_mode_never_picks_an_ending() {
        for seed in 0..100 {
            let theme = select_theme(&fixture(), seed, true).expect("opening theme");
            assert_eq!(theme.theme_type, "OP");
        }
    }

    #[test]
    fn openings_are_picked_seventy_percent_of_the_time() {
        let fixture = fixture();
        let openings = (0..100u64)
            .filter(|seed| {
                select_theme(&fixture, *seed, false)
                    .expect("theme")
                    .theme_type
                    == "OP"
            })
            .count();
        assert_eq!(openings, 70);
    }

    #[test]
    fn title_bearing_urls_are_recognized_so_they_never_reach_the_dom() {
        assert!(is_video_url("https://v.animethemes.moe/Test-OP1.webm"));
        assert!(!is_video_url("http://v.animethemes.moe/Test-OP1.webm"));
        assert!(!is_video_url("https://example.com/Test-OP1.webm"));
        assert!(!is_video_url("https://v.animethemes.moe/Test-OP1.webp"));
    }

    #[test]
    fn the_opaque_name_never_contains_the_title_or_slug() {
        let name = opaque_name("2026-11-14", 16498, "shingeki-no-kyojin-OP1");
        assert!(name.starts_with("clip-"));
        assert!(!name.contains("shingeki"));
        assert!(!name.contains("OP1"));
    }

    #[test]
    fn the_audio_window_matches_the_frontend_clamps() {
        assert!((audio_window_start(90.0, 0.0) - 13.5).abs() < 1e-9);
        assert!((audio_window_start(90.0, 0.38) - 34.2).abs() < 1e-9);
        assert!((audio_window_start(20.0, 0.08) - 3.0).abs() < 1e-9);
        assert!(audio_window_start(10.0, 0.5).abs() < 1e-9);
    }

    #[test]
    fn the_full_clip_lands_next_to_the_segment_with_its_extension() {
        let full = full_clip_path("C:/cache/daily-clips/clip-abc-123.webm");
        assert!(full.starts_with("C:/cache/daily-clips"));
        assert!(full.ends_with("clip-abc-123.full.webm"));
        assert!(full_clip_path("").is_empty());
    }

    #[test]
    fn the_part_file_keeps_the_extension_so_ffmpeg_can_pick_a_muxer() {
        let part = part_clip_path(Path::new("C:/cache/daily-clips/clip-abc-123.webm"));
        assert!(part.to_string_lossy().ends_with("clip-abc-123.part.webm"));
    }
}
