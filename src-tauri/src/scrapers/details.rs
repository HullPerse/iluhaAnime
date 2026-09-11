use futures::StreamExt;
use scraper::{Html, Selector};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::LazyLock;

use crate::auth::{
    load_erai_cookies, load_nekobt_api_key, load_rutracker_cookies, load_rutracker_user_agent,
    rutracker_browser_fetch,
};

use super::clients::{
    absolute_detail_url, acquire_scraper_slot, build_client, build_nekobt_client,
    build_rutracker_client_with_ua, cookies_to_header, decode_rutracker_page,
    is_rutracker_challenge, parse_rus_number, resolve_proxy, rutracker_challenge_error,
    RUTRACKER_DEFAULT_UA,
};

fn hardcoded_selector(raw: &str) -> Selector {
    Selector::parse(raw).expect("hardcoded scraper selector must parse")
}

static TABLE_ROW_SEL: LazyLock<Selector> = LazyLock::new(|| hardcoded_selector("table tr"));
static TABLE_CELL_SEL: LazyLock<Selector> = LazyLock::new(|| hardcoded_selector("th, td"));
static TABLE_ROW_BARE_SEL: LazyLock<Selector> = LazyLock::new(|| hardcoded_selector("tr"));
static DESC_LIST_SEL: LazyLock<Selector> = LazyLock::new(|| hardcoded_selector("dl"));
static DESC_TERM_SEL: LazyLock<Selector> = LazyLock::new(|| hardcoded_selector("dt, dd"));
static PANEL_ROW_SEL: LazyLock<Selector> = LazyLock::new(|| hardcoded_selector(".panel-body .row"));
static PANEL_CELL_SEL: LazyLock<Selector> =
    LazyLock::new(|| hardcoded_selector("div[class*='col-md-']"));
static DATA_CELL_SEL: LazyLock<Selector> = LazyLock::new(|| hardcoded_selector("td, span"));
static NESTED_LIST_SEL: LazyLock<Selector> = LazyLock::new(|| hardcoded_selector("li, tr, ul"));
static IMAGE_SEL: LazyLock<Selector> = LazyLock::new(|| hardcoded_selector("img"));
static POST_BODY_SEL: LazyLock<Selector> =
    LazyLock::new(|| hardcoded_selector(".post_body, .post-message, .postcontent"));
static SPOILER_SEL: LazyLock<Selector> = LazyLock::new(|| {
    hardcoded_selector(".sp-wrap, .spoiler, .spoil, [class*='spoiler'], .screenshots, #screenshots")
});
static SPOILER_HEAD_SEL: LazyLock<Selector> =
    LazyLock::new(|| hardcoded_selector(".sp-head, .sp-title, .spoiler-title, .spoil-head"));
static SPOILER_BODY_SEL: LazyLock<Selector> =
    LazyLock::new(|| hardcoded_selector(".sp-body, .spoiler-body, .sp-content, .spoil-body"));
static COMMENT_SEL: LazyLock<Selector> =
    LazyLock::new(|| hardcoded_selector(".comment, .comment-box, .comment-item, .post"));
static COMMENT_AUTHOR_SEL: LazyLock<Selector> =
    LazyLock::new(|| hardcoded_selector(".author, .username, .user, [class*='author']"));
static COMMENT_DATE_SEL: LazyLock<Selector> =
    LazyLock::new(|| hardcoded_selector("time, .date, .timestamp, [class*='date']"));
static COMMENT_BODY_SEL: LazyLock<Selector> =
    LazyLock::new(|| hardcoded_selector(".comment-body, .comment-content, .post_body, .text, p"));
static COMMENT_MSG_SEL: LazyLock<Selector> =
    LazyLock::new(|| hardcoded_selector(".comment_message, .user_message_c"));
static BODY_SEL: LazyLock<Selector> = LazyLock::new(|| hardcoded_selector("body"));
static FILE_ROW_SEL: LazyLock<Selector> = LazyLock::new(|| {
    hardcoded_selector("#tor-filelist li, #tor-filelist tr, #tor-filelist .file, #tor-filelist .ft-file, .filetree li, .filetree tr")
});
static FILE_CELL_SEL: LazyLock<Selector> = LazyLock::new(|| hardcoded_selector("td, th, span, a"));
static FILE_NESTED_SEL: LazyLock<Selector> = LazyLock::new(|| hardcoded_selector("li, tr"));
static ANCHOR_SEL: LazyLock<Selector> = LazyLock::new(|| hardcoded_selector("a"));

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TorrentDetailField {
    pub label: String,
    pub value: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TorrentDetailFile {
    pub name: String,
    pub size: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TorrentDetailComment {
    pub author: String,
    pub date: String,
    pub text: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TorrentDetails {
    pub source: String,
    pub url: String,
    pub title: String,
    pub description: String,
    pub category: String,
    pub size: String,
    pub uploaded_at: String,
    pub updated_at: String,
    pub seeders: u32,
    pub leechers: u32,
    pub completed: u32,
    pub downloads: u32,
    pub info_hash: String,
    pub magnet: String,
    pub torrent_url: String,
    pub fields: Vec<TorrentDetailField>,
    pub files: Vec<TorrentDetailFile>,
    pub screenshots: Vec<String>,
    pub comments: Vec<TorrentDetailComment>,
    pub notice: Option<String>,
}

fn detail_origin(source: &str) -> Option<&'static str> {
    match source {
        "nyaa" => Some("https://nyaa.si"),
        "sukebei" => Some("https://sukebei.nyaa.si"),
        "rutracker" => Some("https://rutracker.org"),
        "nekobt" => Some("https://nekobt.to"),
        "erai-raws" => Some("https://animetosho.org"),
        _ => None,
    }
}

fn detail_origin_for_url(source: &str, url: &str) -> Option<&'static str> {
    let parsed = url::Url::parse(url).ok()?;
    if parsed.scheme() != "https" {
        return None;
    }
    let host = parsed.host_str()?.to_ascii_lowercase();
    match source {
        "erai-raws" if host == "animetosho.org" => Some("https://animetosho.org"),
        "erai-raws" if host == "erai-raws.info" || host == "www.erai-raws.info" => {
            Some("https://www.erai-raws.info")
        }
        _ => {
            let origin = detail_origin(source)?;
            let origin_url = url::Url::parse(origin).ok()?;
            let origin_host = origin_url.host_str()?;
            (host == origin_host).then_some(origin)
        }
    }
}

fn validate_detail_url(source: &str, url: &str) -> Result<&'static str, String> {
    detail_origin_for_url(source, url)
        .ok_or_else(|| "The torrent URL is outside the selected source".to_string())
}

fn clean_detail_text(value: impl Into<String>) -> String {
    let collapsed = value
        .into()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    [
        (" .", "."),
        (" ,", ","),
        (" !", "!"),
        (" ?", "?"),
        (" ;", ";"),
        (" :", ":"),
        (" )", ")"),
        ("( ", "("),
    ]
    .iter()
    .fold(collapsed, |text, (from, to)| text.replace(from, to))
    .trim()
    .to_string()
}

fn clean_detail_text_multiline(value: impl Into<String>) -> String {
    let mut cleaned = String::new();
    for line in value.into().lines() {
        let line = clean_detail_text(line);
        if line.is_empty() {
            continue;
        }
        if !cleaned.is_empty() {
            cleaned.push('\n');
        }
        cleaned.push_str(&line);
    }
    cleaned
}

fn element_text(element: scraper::ElementRef<'_>) -> String {
    clean_detail_text(element.text().collect::<Vec<_>>().join(" "))
}

const DETAIL_BLOCK_TAGS: &[&str] = &[
    "address",
    "article",
    "aside",
    "blockquote",
    "br",
    "caption",
    "dd",
    "details",
    "div",
    "dl",
    "dt",
    "fieldset",
    "figcaption",
    "figure",
    "footer",
    "form",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "header",
    "hr",
    "li",
    "main",
    "nav",
    "ol",
    "p",
    "pre",
    "section",
    "summary",
    "table",
    "tbody",
    "td",
    "tfoot",
    "th",
    "thead",
    "tr",
    "ul",
];

fn element_text_multiline(element: scraper::ElementRef<'_>) -> String {
    let mut out = String::new();
    for node in element.descendants() {
        if let Some(text) = node.value().as_text() {
            out.push_str(text);
        } else if let Some(el) = node.value().as_element() {
            if DETAIL_BLOCK_TAGS.contains(&el.name()) {
                out.push('\n');
            }
        }
    }
    clean_detail_text_multiline(out)
}

fn first_detail_text(doc: &Html, selectors: &[&str]) -> String {
    selectors
        .iter()
        .filter_map(|raw| Selector::parse(raw).ok())
        .find_map(|selector| doc.select(&selector).next().map(element_text))
        .unwrap_or_default()
}

fn first_detail_text_multiline(doc: &Html, selectors: &[&str]) -> String {
    selectors
        .iter()
        .filter_map(|raw| Selector::parse(raw).ok())
        .find_map(|selector| doc.select(&selector).next().map(element_text_multiline))
        .unwrap_or_default()
}

fn detail_number(value: &str) -> u32 {
    let digits: String = value.chars().filter(char::is_ascii_digit).collect();
    digits.parse().unwrap_or(0)
}

fn detail_field(fields: &[TorrentDetailField], names: &[&str]) -> String {
    fields
        .iter()
        .find(|field| {
            let label = field.label.to_lowercase();
            names.iter().any(|name| label.contains(name))
        })
        .map(|field| field.value.clone())
        .unwrap_or_default()
}

fn parse_detail_fields(doc: &Html) -> Vec<TorrentDetailField> {
    let row_sel = TABLE_ROW_SEL.clone();
    let cell_sel = TABLE_CELL_SEL.clone();
    let mut fields = Vec::new();

    for row in doc.select(&row_sel) {
        let cells: Vec<String> = row.select(&cell_sel).map(element_text_multiline).collect();
        if cells.len() < 2 {
            continue;
        }
        let label = cells[0].trim_end_matches(':').trim().to_string();
        let value = cells[1..].join("\n");
        if !label.is_empty() && !value.is_empty() && label.len() < 80 && value.len() < 500 {
            fields.push(TorrentDetailField { label, value });
        }
        if fields.len() >= 40 {
            break;
        }
    }

    let dl_sel = DESC_LIST_SEL.clone();
    let term_sel = DESC_TERM_SEL.clone();
    for definition_list in doc.select(&dl_sel) {
        let terms: Vec<String> = definition_list
            .select(&term_sel)
            .map(element_text_multiline)
            .filter(|value| !value.is_empty())
            .collect();
        for pair in terms.chunks(2) {
            if pair.len() < 2 || fields.len() >= 40 {
                break;
            }
            let label = pair[0].trim_end_matches(':').trim().to_string();
            let value = pair[1].clone();
            if !label.is_empty() && label.len() < 80 && value.len() < 500 {
                fields.push(TorrentDetailField { label, value });
            }
        }
        if fields.len() >= 40 {
            break;
        }
    }

    let mut bootstrap_fields = parse_bootstrap_detail_fields(doc);
    for field in bootstrap_fields.drain(..) {
        let duplicate = fields
            .iter()
            .any(|existing: &TorrentDetailField| existing.label == field.label);
        if !duplicate && fields.len() < 40 {
            fields.push(field);
        }
    }
    fields
}

fn parse_bootstrap_detail_fields(doc: &Html) -> Vec<TorrentDetailField> {
    let row_sel = PANEL_ROW_SEL.clone();
    let cell_sel = PANEL_CELL_SEL.clone();
    let mut fields = Vec::new();
    for row in doc.select(&row_sel) {
        let cells: Vec<String> = row
            .select(&cell_sel)
            .map(element_text_multiline)
            .filter(|value| !value.is_empty())
            .collect();
        for pair in cells.chunks(2) {
            if pair.len() < 2 {
                continue;
            }
            let label = pair[0].trim_end_matches(':').trim().to_string();
            let value = pair[1].trim().to_string();
            if !label.is_empty() && label.len() < 80 && value.len() < 500 {
                fields.push(TorrentDetailField { label, value });
            }
            if fields.len() >= 40 {
                return fields;
            }
        }
    }
    fields
}

fn parse_detail_files(doc: &Html) -> Vec<TorrentDetailFile> {
    let selectors = [
        ".torrent-file-list li",
        ".torrent-file-list tr",
        ".torrent-file-list .file",
        ".file-list li",
        ".file-list tr",
        ".file-list .file",
        ".file-list .row",
        ".files li",
        ".files tr",
        ".files .file",
        "ul.torrent-files li",
        "#filelist li",
        "#filelist tr",
        "#torrent-files li",
        "#torrent-files tr",
        ".filelist li",
        ".filelist tr",
        "table.files tr",
        "table.filelist tr",
    ];
    let mut files = Vec::new();
    for raw in selectors {
        let Ok(selector) = Selector::parse(raw) else {
            continue;
        };
        for element in doc.select(&selector) {
            let text = element_text(element);
            if text.is_empty() || text.len() > 500 {
                continue;
            }
            let cells = DATA_CELL_SEL.clone();
            let parts: Vec<String> = element
                .select(&cells)
                .map(element_text)
                .filter(|s| !s.is_empty())
                .collect();
            let nested_sel = NESTED_LIST_SEL.clone();
            let has_nested = element.select(&nested_sel).next().is_some();
            let (name, size) = if has_nested {
                continue;
            } else if parts.len() >= 2 {
                (
                    parts[..parts.len() - 1].join(" / "),
                    parts.last().cloned().unwrap_or_default(),
                )
            } else if parts.len() == 1 {
                let size_text = parts[0]
                    .trim()
                    .trim_start_matches('(')
                    .trim_end_matches(')');
                if looks_like_file_size(size_text) {
                    let name = text
                        .trim_end()
                        .strip_suffix(parts[0].as_str())
                        .map(str::trim)
                        .filter(|name| !name.is_empty())
                        .unwrap_or(&text)
                        .to_string();
                    (name, parts[0].clone())
                } else {
                    (text, String::new())
                }
            } else {
                (text, String::new())
            };
            if !files
                .iter()
                .any(|file: &TorrentDetailFile| file.name == name)
            {
                files.push(TorrentDetailFile { name, size });
            }
            if files.len() >= 300 {
                break;
            }
        }
        if !files.is_empty() {
            break;
        }
    }

    if files.is_empty() {
        let row_sel = TABLE_ROW_SEL.clone();
        let cell_sel = TABLE_CELL_SEL.clone();
        let file_name_re =
            regex_lite::Regex::new(r"(?i)(?:\.[a-z0-9]{1,8})(?:$|[\s)])").expect("hardcoded regex");
        for row in doc.select(&row_sel) {
            let cells: Vec<String> = row
                .select(&cell_sel)
                .map(element_text)
                .filter(|value| !value.is_empty())
                .collect();
            if cells.len() < 2 || !file_name_re.is_match(&cells[0]) {
                continue;
            }
            let name = cells[..cells.len() - 1].join(" / ");
            let size = cells.last().cloned().unwrap_or_default();
            if !files.iter().any(|file| file.name == name) {
                files.push(TorrentDetailFile { name, size });
            }
            if files.len() >= 300 {
                break;
            }
        }
    }
    files
}

const IMAGE_NOISE: &[&str] = &[
    "logo", "avatar", "icon", "emoji", "emoticon", "smilie", "smiley", "captcha", "spacer",
    "pixel", "blank", "rating", "bullet", "arrow", "banner", "favicon", "imageset", "/styles/",
    "loading", "userbar", "1x1", "q_icon", "edited", "online", "offline", "flag_",
];

fn is_image_noise(class: &str, src_lower: &str) -> bool {
    let hay = format!("{class} {src_lower}");
    IMAGE_NOISE.iter().any(|part| hay.contains(part))
}

fn push_image_src(src: &str, origin: &str, images: &mut Vec<String>) {
    let src = src.trim();
    if src.is_empty() {
        return;
    }
    let url = absolute_detail_url(origin, src);
    if url.starts_with("https://") && !images.contains(&url) {
        images.push(url);
    }
}

fn collect_imgs(
    element: scraper::ElementRef<'_>,
    origin: &str,
    images: &mut Vec<String>,
    limit: usize,
) {
    let image_sel = IMAGE_SEL.clone();
    for image in element.select(&image_sel) {
        let value = image.value();
        let src = value
            .attr("data-original")
            .or_else(|| value.attr("data-src"))
            .or_else(|| value.attr("src"))
            .unwrap_or_default();
        let class = value.attr("class").unwrap_or_default().to_lowercase();
        if src.trim().is_empty() || is_image_noise(&class, &src.to_lowercase()) {
            continue;
        }
        push_image_src(src, origin, images);
        if images.len() >= limit {
            break;
        }
    }
}

fn collect_markdown_imgs(
    element: scraper::ElementRef<'_>,
    origin: &str,
    images: &mut Vec<String>,
    limit: usize,
) {
    let html = element.inner_html();
    let Ok(re) = regex_lite::Regex::new(r"!\[[^\]]*\]\((https?://[^)\s]+)\)") else {
        return;
    };
    for cap in re.captures_iter(&html) {
        if let Some(m) = cap.get(1) {
            push_image_src(&m.as_str().replace("&amp;", "&"), origin, images);
            if images.len() >= limit {
                break;
            }
        }
    }
}

fn description_container<'a>(doc: &'a Html, source: &str) -> Option<scraper::ElementRef<'a>> {
    let selectors: &[&str] = match source {
        "rutracker" => &[".post_body", ".post-message", ".postcontent"],
        "nyaa" | "sukebei" => &[
            "#torrent-description",
            ".torrent-description",
            ".panel-body.markdown-text",
            ".panel-body",
        ],
        "erai-raws" => &[
            ".comment_message",
            ".user_message_c",
            ".comment-body",
            ".comment-content",
        ],
        "nekobt" => &[],
        _ => &[
            "#torrent-description",
            ".torrent-description",
            ".post_body",
            ".post-message",
            ".comment_message",
            ".user_message_c",
            ".panel-body.markdown-text",
            ".description",
        ],
    };
    selectors
        .iter()
        .filter_map(|raw| Selector::parse(raw).ok())
        .find_map(|selector| doc.select(&selector).next())
}

fn collect_rutracker_screenshots(doc: &Html, origin: &str) -> Vec<String> {
    let post_sel = POST_BODY_SEL.clone();
    let Some(post) = doc.select(&post_sel).next() else {
        return Vec::new();
    };

    let spoiler_sel = SPOILER_SEL.clone();
    let heading_sel = SPOILER_HEAD_SEL.clone();
    let body_sel = SPOILER_BODY_SEL.clone();
    let mut images = Vec::new();

    for spoiler in post.select(&spoiler_sel) {
        let heading = spoiler
            .select(&heading_sel)
            .next()
            .map(element_text)
            .unwrap_or_default()
            .to_lowercase();
        let class = spoiler
            .value()
            .attr("class")
            .unwrap_or_default()
            .to_lowercase();
        let is_screenshot_spoiler = heading.contains("скриншот")
            || heading.contains("screenshot")
            || class.contains("screenshot");
        if !is_screenshot_spoiler {
            continue;
        }

        let image_area = spoiler.select(&body_sel).next().unwrap_or(spoiler);
        collect_imgs(image_area, origin, &mut images, 24);
        if images.len() >= 24 {
            break;
        }
    }
    images
}

fn parse_detail_screenshots(doc: &Html, origin: &str, source: &str) -> Vec<String> {
    if source == "nekobt" {
        return Vec::new();
    }
    if source == "rutracker" {
        return collect_rutracker_screenshots(doc, origin);
    }

    let mut images: Vec<String> = Vec::new();
    const LIMIT: usize = 24;

    if source == "erai-raws" {
        let screenshot_selectors = [
            ".screenshots",
            "#screenshots",
            ".screenshot-list",
            ".preview-list",
            ".preview",
        ];
        for raw in screenshot_selectors {
            let Ok(selector) = Selector::parse(raw) else {
                continue;
            };
            if let Some(container) = doc.select(&selector).next() {
                collect_imgs(container, origin, &mut images, LIMIT);
                if !images.is_empty() {
                    break;
                }
            }
        }
    }

    if images.is_empty() {
        if let Some(container) = description_container(doc, source) {
            collect_imgs(container, origin, &mut images, LIMIT);
            collect_markdown_imgs(container, origin, &mut images, LIMIT);
        }
    }

    if images.is_empty() {
        let image_sel = IMAGE_SEL.clone();
        for image in doc.select(&image_sel) {
            let value = image.value();
            let src = value
                .attr("data-original")
                .or_else(|| value.attr("data-src"))
                .or_else(|| value.attr("src"))
                .unwrap_or_default();
            let class = value.attr("class").unwrap_or_default().to_lowercase();
            if src.trim().is_empty() || is_image_noise(&class, &src.to_lowercase()) {
                continue;
            }
            push_image_src(src, origin, &mut images);
            if images.len() >= LIMIT {
                break;
            }
        }
    }
    images
}

fn parse_detail_comments(doc: &Html, source: &str) -> Vec<TorrentDetailComment> {
    let block_sel = COMMENT_SEL.clone();
    let author_sel = COMMENT_AUTHOR_SEL.clone();
    let date_sel = COMMENT_DATE_SEL.clone();
    let body_sel = COMMENT_BODY_SEL.clone();
    let mut comments = Vec::new();
    let mut skipped_primary_description = false;

    for block in doc.select(&block_sel) {
        let is_primary_description = match source {
            "rutracker" => block.select(&body_sel).next().is_some(),
            "erai-raws" => block.select(&COMMENT_MSG_SEL).next().is_some(),
            _ => false,
        };
        if is_primary_description && !skipped_primary_description {
            skipped_primary_description = true;
            continue;
        }

        let text = element_text(block);
        if text.is_empty() || text.len() > 4000 {
            continue;
        }
        let author = block
            .select(&author_sel)
            .next()
            .map(element_text)
            .unwrap_or_default();
        let date = block
            .select(&date_sel)
            .next()
            .map(element_text)
            .unwrap_or_default();
        let body = block
            .select(&body_sel)
            .next()
            .map_or_else(|| element_text_multiline(block), element_text_multiline);
        if !comments
            .iter()
            .any(|comment: &TorrentDetailComment| comment.text == body)
        {
            comments.push(TorrentDetailComment {
                author,
                date,
                text: body,
            });
        }
        if comments.len() >= 100 {
            break;
        }
    }
    comments
}

fn text_stat_value(text: &str, labels: &[&str]) -> String {
    let lower = text.to_lowercase();
    for label in labels {
        let Some(start) = lower.find(label) else {
            continue;
        };
        let value = text[start + label.len()..]
            .trim_start_matches(|ch: char| ch == ':' || ch.is_whitespace())
            .split('|')
            .next()
            .and_then(|part| part.lines().find(|line| !line.trim().is_empty()))
            .unwrap_or_default()
            .trim();
        if !value.is_empty() {
            return value.to_string();
        }
    }
    String::new()
}

fn parse_rutracker_topic_stats(doc: &Html) -> (String, String, u32, u32, u32) {
    let body_sel = BODY_SEL.clone();
    let text = doc
        .select(&body_sel)
        .next()
        .map(element_text_multiline)
        .unwrap_or_default();
    let size = text_stat_value(&text, &["размер"]);
    let registered = text_stat_value(&text, &["зарегистрирован"]);
    let downloaded = text_stat_value(&text, &[".torrent скачан", "скачан"]);
    let seeders = parse_rus_number(&text_stat_value(&text, &["сиды"]));
    let leechers = parse_rus_number(&text_stat_value(&text, &["личи"]));
    (
        size,
        registered,
        parse_rus_number(&downloaded),
        seeders,
        leechers,
    )
}

fn rutracker_topic_id(url: &str) -> Option<String> {
    let start = ["?t=", "&t="]
        .iter()
        .filter_map(|marker| url.find(marker).map(|index| index + marker.len()))
        .min()?;
    let topic_id: String = url[start..]
        .chars()
        .take_while(char::is_ascii_digit)
        .collect();
    (!topic_id.is_empty()).then_some(topic_id)
}

fn looks_like_file_name(value: &str) -> bool {
    regex_lite::Regex::new(r"(?i)\.[a-z0-9]{1,8}(?:$|[\s)])")
        .expect("hardcoded regex")
        .is_match(value)
}

fn looks_like_file_size(value: &str) -> bool {
    regex_lite::Regex::new(
        r"(?i)^\s*[0-9]+(?:[.,][0-9]+)?\s*(?:b|kb|kib|mb|mib|gb|gib|tb|tib|байт|кб|мб|гб)\s*$",
    )
    .expect("hardcoded regex")
    .is_match(value)
}

fn parse_rutracker_file_tree(response: &str) -> Vec<TorrentDetailFile> {
    let html = serde_json::from_str::<serde_json::Value>(response)
        .ok()
        .and_then(|json| {
            json.get("html")
                .or_else(|| json.get("data"))
                .and_then(|value| value.as_str())
                .map(str::to_string)
        })
        .unwrap_or_else(|| response.to_string());
    let doc = Html::parse_document(&html);
    let row_sel = FILE_ROW_SEL.clone();
    let cell_sel = FILE_CELL_SEL.clone();
    let nested_sel = FILE_NESTED_SEL.clone();
    let mut files = Vec::new();

    for row in doc.select(&row_sel) {
        if row.select(&nested_sel).next().is_some() {
            continue;
        }
        let text = element_text(row);
        if text.is_empty() || text.len() > 1000 {
            continue;
        }
        let parts: Vec<String> = row
            .select(&cell_sel)
            .map(element_text)
            .filter(|part| !part.is_empty())
            .collect();
        let name = parts
            .iter()
            .find(|part| looks_like_file_name(part))
            .cloned()
            .or_else(|| {
                let candidate = text.split(" (").next().unwrap_or(text.as_str()).trim();
                looks_like_file_name(candidate).then_some(candidate.to_string())
            });
        let Some(name) = name else { continue };
        let size = parts
            .iter()
            .rev()
            .find(|part| looks_like_file_size(part))
            .cloned()
            .unwrap_or_default();
        if !files
            .iter()
            .any(|file: &TorrentDetailFile| file.name == name)
        {
            files.push(TorrentDetailFile { name, size });
        }
        if files.len() >= 500 {
            break;
        }
    }
    files
}

async fn fetch_rutracker_file_tree(
    app_handle: &tauri::AppHandle,
    client: &reqwest::Client,
    cookies: &HashMap<String, String>,
    topic_id: &str,
) -> Result<String, String> {
    let file_tree_url = format!("https://rutracker.org/forum/viewtorrent.php?t={topic_id}");
    let browser_response = rutracker_browser_fetch(app_handle, &file_tree_url).await?;
    let (status, bytes) = if let Some(response) = browser_response {
        (response.status, response.body)
    } else {
        let response = client
            .get("https://rutracker.org/forum/viewtorrent.php")
            .header("Cookie", cookies_to_header(cookies))
            .header("Referer", "https://rutracker.org/forum/")
            .header("X-Requested-With", "XMLHttpRequest")
            .query(&[("t", topic_id)])
            .send()
            .await
            .map_err(|error| format!("Rutracker file list request failed: {error}"))?;
        let status = response.status().as_u16();
        let bytes = response
            .bytes()
            .await
            .map_err(|error| format!("Rutracker file list read failed: {error}"))?
            .to_vec();
        (status, bytes)
    };
    const MAX_FILE_TREE_BYTES: usize = 4 * 1024 * 1024;
    if bytes.len() > MAX_FILE_TREE_BYTES {
        return Err("Rutracker file list is too large to display safely".to_string());
    }
    let html = decode_rutracker_page(&bytes);
    if !(200..300).contains(&status) {
        if is_rutracker_challenge(&html) {
            return Err(rutracker_challenge_error());
        }
        return Err(format!("Rutracker file list returned HTTP {status}"));
    }
    if is_rutracker_challenge(&html) {
        return Err(rutracker_challenge_error());
    }
    Ok(html)
}

fn max_labeled_number(text: &str, label: &str) -> u32 {
    let label = label.to_ascii_lowercase();
    let lines: Vec<&str> = text.lines().collect();
    let mut maximum = 0;
    for (index, line) in lines.iter().enumerate() {
        let trimmed = line.trim();
        let Some((name, value)) = trimmed.split_once(':') else {
            continue;
        };
        if name.trim().to_ascii_lowercase() != label {
            continue;
        }
        let candidate = value
            .trim()
            .parse::<u32>()
            .ok()
            .or_else(|| lines.get(index + 1)?.trim().parse::<u32>().ok());
        if let Some(value) = candidate {
            maximum = maximum.max(value);
        }
    }
    maximum
}

fn parse_animetosho_stats(doc: &Html) -> (String, String, u32, u32, u32) {
    let body_sel = BODY_SEL.clone();
    let text = doc
        .select(&body_sel)
        .next()
        .map(element_text_multiline)
        .unwrap_or_default();
    let size = animetosho_size(&text);
    let date = text_stat_value(&text, &["date submitted"]);
    (
        size,
        date,
        max_labeled_number(&text, "C"),
        max_labeled_number(&text, "S"),
        max_labeled_number(&text, "L"),
    )
}

fn animetosho_size(text: &str) -> String {
    let trimmed = text.trim();
    if looks_like_file_size(trimmed) {
        return trimmed.to_string();
    }
    let lower = text.to_lowercase();
    let window = lower.find("file name").map_or(text, |label_start| {
        &text[label_start..text.len().min(label_start + 300)]
    });
    let Ok(re) = regex_lite::Regex::new(r"\(([0-9.,]+\s*(?:[KMGT]i?B|байт|B))\s*\)") else {
        return String::new();
    };
    re.captures(window)
        .and_then(|cap| cap.get(1))
        .map(|m| m.as_str().trim().to_string())
        .unwrap_or_default()
}

fn parse_animetosho_comment(doc: &Html) -> String {
    let row_sel = TABLE_ROW_BARE_SEL.clone();
    let cell_sel = TABLE_CELL_SEL.clone();
    for row in doc.select(&row_sel) {
        let cells: Vec<String> = row
            .select(&cell_sel)
            .map(element_text_multiline)
            .filter(|value| !value.is_empty())
            .collect();
        if cells.len() >= 2 && cells[0].trim().eq_ignore_ascii_case("comment") {
            return cells[1..].join("\n");
        }
    }
    String::new()
}

fn parse_animetosho_file(doc: &Html) -> Vec<TorrentDetailFile> {
    let row_sel = TABLE_ROW_BARE_SEL.clone();
    let cell_sel = TABLE_CELL_SEL.clone();
    for row in doc.select(&row_sel) {
        let cells: Vec<String> = row
            .select(&cell_sel)
            .map(element_text)
            .filter(|value| !value.is_empty())
            .collect();
        if cells.len() < 2 || !cells[0].trim().eq_ignore_ascii_case("file name (size)") {
            continue;
        }
        let raw = &cells[1];
        let name = raw
            .split('(')
            .next()
            .map(str::trim)
            .filter(|name| looks_like_file_name(name))
            .unwrap_or_default()
            .to_string();
        let size = animetosho_size(raw);
        if !name.is_empty() {
            return vec![TorrentDetailFile { name, size }];
        }
    }
    Vec::new()
}

fn parse_torrent_detail_html(source: &str, url: &str, html: &str) -> TorrentDetails {
    let origin = detail_origin_for_url(source, url)
        .or_else(|| detail_origin(source))
        .unwrap_or("");
    let doc = Html::parse_document(html);
    let (topic_size, topic_registered, topic_downloads, topic_seeders, topic_leechers) =
        if source == "rutracker" {
            parse_rutracker_topic_stats(&doc)
        } else if source == "erai-raws" {
            parse_animetosho_stats(&doc)
        } else {
            (String::new(), String::new(), 0, 0, 0)
        };
    let fields = if source == "rutracker" {
        Vec::new()
    } else {
        parse_detail_fields(&doc)
    };
    let title_selectors: &[&str] = match source {
        "nyaa" | "sukebei" => &[
            "h3.panel-title",
            ".panel-title",
            ".torrent-title",
            "h1",
            "h2",
            "title",
        ],
        "rutracker" => &[
            "h1.torTopic",
            "h1.maintitle",
            ".topic-title",
            ".maintitle",
            "h1",
            "h2",
            "title",
        ],
        "erai-raws" => &[
            ".release-title",
            ".torrent-title",
            "h1",
            "h2",
            ".title",
            "title",
        ],
        "nekobt" => &[".torrent-title", "h1", "h2", "title"],
        _ => &["h1", "h2", "title"],
    };
    let description_selectors: &[&str] = match source {
        "nyaa" | "sukebei" => &[
            "#torrent-description",
            ".torrent-description",
            ".panel-body.markdown-text",
            ".panel-body",
            ".description",
        ],
        "rutracker" => &[".post_body", ".post-message", ".postcontent"],
        "erai-raws" => &[
            ".comment_message",
            ".user_message_c",
            ".comment-body",
            ".comment-content",
            ".description",
        ],
        "nekobt" => &[],
        _ => &[
            "#torrent-description",
            ".torrent-description",
            ".description",
            ".post_body",
        ],
    };
    let title = first_detail_text(&doc, title_selectors);
    let mut description = first_detail_text_multiline(&doc, description_selectors);
    if description.is_empty() && source == "erai-raws" {
        description = parse_animetosho_comment(&doc);
    }
    let mut magnet = String::new();
    let mut torrent_url = String::new();
    let link_sel = ANCHOR_SEL.clone();
    for link in doc.select(&link_sel) {
        let href = link.value().attr("href").unwrap_or_default();
        if href.starts_with("magnet:") && magnet.is_empty() {
            magnet = href.to_string();
            continue;
        }
        if torrent_url.is_empty() {
            let class = link.value().attr("class").unwrap_or_default();
            let is_rutracker_download = source == "rutracker"
                && (href.to_lowercase().contains("dl.php")
                    || class.split_whitespace().any(|value| value == "dl-link"));
            if href.to_lowercase().contains(".torrent") || is_rutracker_download {
                let candidate = absolute_detail_url(origin, href);
                let same_origin = candidate == origin
                    || candidate
                        .strip_prefix(origin)
                        .is_some_and(|rest| rest.starts_with('/'));
                if same_origin {
                    torrent_url = candidate;
                }
            }
        }
    }
    let category = detail_field(&fields, &["category", "раздел", "категория"]);
    let parsed_size = detail_field(&fields, &["size", "размер"]);
    let size = if topic_size.is_empty() || !looks_like_file_size(&topic_size) {
        parsed_size
    } else {
        topic_size
    };
    let parsed_uploaded_at = detail_field(
        &fields,
        &[
            "uploaded",
            "added",
            "date",
            "submitted",
            "дата",
            "добавлен",
            "создан",
        ],
    );
    let uploaded_at = if topic_registered.is_empty() {
        parsed_uploaded_at
    } else {
        topic_registered
    };
    let updated_at = detail_field(&fields, &["updated", "обновлен"]);
    let parsed_seeders = detail_number(&detail_field(&fields, &["seeder", "сид"]));
    let seeders = if topic_seeders == 0 {
        parsed_seeders
    } else {
        topic_seeders
    };
    let parsed_leechers = detail_number(&detail_field(&fields, &["leecher", "лич"]));
    let leechers = if topic_leechers == 0 {
        parsed_leechers
    } else {
        topic_leechers
    };
    let parsed_completed = detail_number(&detail_field(
        &fields,
        &["completed", "downloaded", "скачан"],
    ));
    let completed = if topic_downloads == 0 {
        parsed_completed
    } else {
        topic_downloads
    };
    let info_hash = detail_field(&fields, &["info hash", "hash", "хеш"]);
    let downloads = topic_downloads;
    let files = if source == "rutracker" {
        Vec::new()
    } else if source == "erai-raws" && parse_detail_files(&doc).is_empty() {
        parse_animetosho_file(&doc)
    } else {
        parse_detail_files(&doc)
    };
    let screenshots = parse_detail_screenshots(&doc, origin, source);
    let comments = parse_detail_comments(&doc, source);
    let has_details = !description.is_empty()
        || !fields.is_empty()
        || !files.is_empty()
        || !screenshots.is_empty()
        || !comments.is_empty()
        || !magnet.is_empty()
        || !torrent_url.is_empty();
    let notice = if has_details {
        None
    } else {
        Some("Источник вернул страницу без доступных деталей. Оригинал можно открыть во внешнем браузере.".to_string())
    };

    TorrentDetails {
        source: source.to_string(),
        url: url.to_string(),
        title,
        description,
        category,
        size,
        uploaded_at,
        updated_at,
        seeders,
        leechers,
        completed,
        downloads,
        info_hash,
        magnet,
        torrent_url,
        fields,
        files,
        screenshots,
        comments,
        notice,
    }
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_torrent_details(
    app_handle: tauri::AppHandle,
    source: String,
    url: String,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<TorrentDetails, String> {
    let origin = validate_detail_url(&source, &url)?;
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let client = if source == "nekobt" {
        build_nekobt_client(proxy.as_deref())?
    } else if source == "rutracker" {
        let user_agent = load_rutracker_user_agent(&app_handle)
            .unwrap_or_else(|| RUTRACKER_DEFAULT_UA.to_string());
        build_rutracker_client_with_ua(&user_agent, proxy.as_deref())?
    } else {
        build_client(proxy.as_deref())?
    };
    let mut request = client.get(&url);
    if source == "rutracker" {
        let cookies = load_rutracker_cookies(&app_handle);
        if cookies.is_empty() {
            return Err("Not authenticated. Please login to rutracker first.".to_string());
        }
        request = request.header("Cookie", cookies_to_header(&cookies));
    } else if source == "erai-raws"
        && detail_origin_for_url(&source, &url) == Some("https://www.erai-raws.info")
    {
        let cookies = load_erai_cookies();
        if cookies.is_empty() {
            return Err("Not authenticated. Please login to Erai-Raws first.".to_string());
        }
        request = request.header("Cookie", cookies_to_header(&cookies));
    } else if source == "nekobt" {
        let key = load_nekobt_api_key(&app_handle);
        if key.is_empty() {
            return Err("Not authenticated. Please enter your nekoBT API key first.".to_string());
        }
        request = request.header("Cookie", format!("ssid={key}"));
    }
    const MAX_DETAIL_RESPONSE_BYTES: usize = 8 * 1024 * 1024;
    let browser_response = if source == "rutracker" && proxy.is_none() {
        rutracker_browser_fetch(&app_handle, &url).await?
    } else {
        None
    };
    let (status, body) = if let Some(response) = browser_response {
        (response.status, response.body)
    } else {
        let _slot = acquire_scraper_slot().await?;
        let response = request
            .send()
            .await
            .map_err(|e| format!("Torrent details request failed: {e}"))?;
        let status = response.status().as_u16();
        let mut body = Vec::new();
        let mut stream = response.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| format!("Read error: {e}"))?;
            if body.len().saturating_add(chunk.len()) > MAX_DETAIL_RESPONSE_BYTES {
                return Err("Torrent page is too large to display safely".to_string());
            }
            body.extend_from_slice(&chunk);
        }
        (status, body)
    };
    if !(200..300).contains(&status) {
        return Err(format!("Torrent page returned HTTP {status}"));
    }
    if body.len() > MAX_DETAIL_RESPONSE_BYTES {
        return Err("Torrent page is too large to display safely".to_string());
    }
    let html = if source == "rutracker" {
        decode_rutracker_page(&body)
    } else {
        String::from_utf8_lossy(&body).to_string()
    };
    if source == "rutracker" && is_rutracker_challenge(&html) {
        return Err(rutracker_challenge_error());
    }
    let mut details = parse_torrent_detail_html(&source, &url, &html);

    if source == "rutracker" {
        let cookies = load_rutracker_cookies(&app_handle);
        if let Some(topic_id) = rutracker_topic_id(&url) {
            if let Ok(file_tree) =
                fetch_rutracker_file_tree(&app_handle, &client, &cookies, &topic_id).await
            {
                details.files = parse_rutracker_file_tree(&file_tree);
            }
        }
    }

    if details.title.is_empty() {
        details.title = origin.to_string();
    }
    Ok(details)
}

#[cfg(test)]
mod tests {
    use super::super::search::{search_erairaws, search_nyaa, search_sukebei};
    use super::*;

    #[test]
    fn detail_url_validation_rejects_cross_source_and_spoofed_hosts() {
        assert!(validate_detail_url("nyaa", "https://nyaa.si/view/123").is_ok());
        assert!(validate_detail_url("nyaa", "https://nyaa.si.evil.test/view/123").is_err());
        assert!(
            validate_detail_url("nyaa", "https://rutracker.org/forum/viewtopic.php?t=1").is_err()
        );
        assert!(validate_detail_url("unknown", "https://nyaa.si/view/123").is_err());
    }

    #[test]
    fn detail_url_validation_accepts_each_scraper_origin() {
        let urls = [
            ("erai-raws", "https://animetosho.org/view/example"),
            ("rutracker", "https://rutracker.org/forum/viewtopic.php?t=1"),
            ("nyaa", "https://nyaa.si/view/1"),
            ("sukebei", "https://sukebei.nyaa.si/view/1"),
            ("nekobt", "https://nekobt.to/torrents/1"),
        ];
        for (source, url) in urls {
            assert!(
                validate_detail_url(source, url).is_ok(),
                "{source} should accept {url}"
            );
        }
    }

    #[test]
    fn detail_parser_supports_tracker_panels_and_external_screenshots() {
        let html = r#"
            <html><head><title>Fallback title</title></head>
            <body>
              <h3 class="panel-title">Example torrent</h3>
              <table><tr><th>Size:</th><td>1.5 GiB</td></tr><tr><th>Seeders:</th><td>42</td></tr></table>
              <div class="panel-body markdown-text">A useful <b>description</b>.</div>
              <table class="file-list"><tr><td>episode.mkv</td><td>1.5 GiB</td></tr></table>
              <div class="comment"><span class="author">alice</span><time>today</time><p>Hello!</p></div>
              <img src="/screens/one.jpg"><img src="https://images.example/preview.jpg"><img src="javascript:alert(1)">
              <a href="magnet:?xt=urn:btih:ABC">magnet</a>
              <a href="https://tracker.example/file.torrent">external torrent</a>
            </body></html>
        "#;
        let details = parse_torrent_detail_html("nyaa", "https://nyaa.si/view/1", html);
        assert_eq!(details.title, "Example torrent");
        assert_eq!(details.description, "A useful description.");
        assert_eq!(details.seeders, 42);
        assert_eq!(details.files.len(), 1);
        assert_eq!(details.comments.len(), 1);
        assert_eq!(details.magnet, "magnet:?xt=urn:btih:ABC");
        assert_eq!(details.torrent_url, "");
        assert_eq!(
            details.screenshots,
            vec![
                "https://nyaa.si/screens/one.jpg",
                "https://images.example/preview.jpg"
            ]
        );
    }

    #[test]
    fn sukebei_detail_parser_uses_the_same_tracker_markup() {
        let html = r#"
            <h3 class="panel-title">Sukebei release</h3>
            <div class="panel-body markdown-text">A release description.</div>
            <img src="https://images.example/sukebei.jpg">
        "#;
        let details =
            parse_torrent_detail_html("sukebei", "https://sukebei.nyaa.si/view/123", html);
        assert_eq!(details.title, "Sukebei release");
        assert_eq!(details.description, "A release description.");
        assert_eq!(
            details.screenshots,
            vec!["https://images.example/sukebei.jpg"]
        );
    }

    #[test]
    fn nekobt_shell_without_metadata_is_reported_as_unavailable_details() {
        let details = parse_torrent_detail_html(
            "nekobt",
            "https://nekobt.to/torrents/123",
            "<html><head><title>nekoBT</title></head><body><div id=app></div></body></html>",
        );
        assert!(details.title == "nekoBT");
        assert!(details.notice.is_some());
    }

    #[test]
    fn rutracker_detail_parser_accepts_authenticated_download_link_shape() {
        let html = r#"
            <h1>Russian release</h1>
            <table><tr><th>Size</th><td>2 GiB</td></tr></table>
            <a class="dl-link" href="/forum/dl.php?t=123">Download torrent</a>
        "#;
        let details = parse_torrent_detail_html(
            "rutracker",
            "https://rutracker.org/forum/viewtopic.php?t=123",
            html,
        );
        assert_eq!(
            details.torrent_url,
            "https://rutracker.org/forum/dl.php?t=123"
        );
    }

    #[test]
    fn rutracker_screenshots_come_from_post_body_not_page_icons() {
        let html = r#"
            <html><head><title>t</title></head><body>
              <div class="post_head">
                <img src="https://rutracker.org/forum/styles/imageset/ru/icon_topic_hot.png">
                <img class="smilie" src="https://rutracker.org/forum/images/smilies/icon_e_smile.gif">
              </div>
              <div class="post_body">
                Название: Test<br>
                <img src="https://rutracker.org/forum/images/flags/ru.gif">
                <div class="sp-wrap">
                  <div class="sp-head">Скриншоты</div>
                  <div class="sp-body">
                    <img src="https://img.rutracker.org/f/001/screenshot1.jpg">
                    <a href="https://rutracker.org/forum/viewtopic.php?p=1#p1"><img class="postImg" src="https://img.rutracker.org/f/001/screenshot2.jpg"></a>
                  </div>
                </div>
              </div>
              <div class="post_body">
                Reply body with <img src="https://img.rutracker.org/f/002/reply-pic.jpg">
              </div>
            </body></html>
        "#;
        let details = parse_torrent_detail_html(
            "rutracker",
            "https://rutracker.org/forum/viewtopic.php?t=123",
            html,
        );
        assert_eq!(
            details.screenshots,
            vec![
                "https://img.rutracker.org/f/001/screenshot1.jpg",
                "https://img.rutracker.org/f/001/screenshot2.jpg",
            ]
        );
    }

    #[test]
    fn rutracker_topic_stats_and_comments_use_their_own_sections() {
        let html = r#"
            <html><body>
              <div class="topic-stats">Размер: 17.09 GB | Зарегистрирован: 14 лет 8 месяцев | .torrent скачан: 8,496 раз | Сиды: 14 | Личи: 13</div>
              <div class="post"><div class="post_body">Release description<div class="sp-wrap"><div class="sp-head">Скриншоты</div><div class="sp-body"></div></div></div></div>
              <div class="post"><div class="post_body">A real reply</div><span class="author">alice</span></div>
              <script>var fake = 'Скачан: 0 раз';</script>
            </body></html>
        "#;
        let details = parse_torrent_detail_html(
            "rutracker",
            "https://rutracker.org/forum/viewtopic.php?t=3512528",
            html,
        );
        assert_eq!(details.size, "17.09 GB");
        assert_eq!(details.uploaded_at, "14 лет 8 месяцев");
        assert_eq!(details.downloads, 8496);
        assert_eq!(details.seeders, 14);
        assert_eq!(details.leechers, 13);
        assert_eq!(details.comments.len(), 1);
        assert_eq!(details.comments[0].text, "A real reply");
    }

    #[test]
    fn rutracker_file_tree_parser_ignores_folder_wrappers_and_scripts() {
        let html = r#"
            <div id="tor-filelist">
              <ul><li class="folder">Season 1<ul>
                <li><span class="ft-file">episode-01.mkv</span><span class="ft-size">635 MiB</span></li>
                <li><span class="ft-file">episode-02.mkv</span><span class="ft-size">640 MiB</span></li>
              </ul></li></ul>
              <script>var fake = 'page.js';</script>
            </div>
        "#;
        let files = parse_rutracker_file_tree(html);
        assert_eq!(files.len(), 2);
        assert_eq!(files[0].name, "episode-01.mkv");
        assert_eq!(files[0].size, "635 MiB");
        assert_eq!(
            rutracker_topic_id("https://rutracker.org/forum/viewtopic.php?t=3512528"),
            Some("3512528".to_string())
        );
    }

    #[test]
    fn nyaa_screenshots_extract_markdown_images_from_description() {
        let html = r#"
            <html><head><title>t</title></head><body>
              <div markdown-text class="panel-body" id="torrent-description">
                **Video:** 1080p<br>
                ![](https://i.kek.sh/screen1.jpg)<br>
                ![](https://i.kek.sh/screen2.jpg?w=1200&amp;h=675)
              </div>
            </body></html>
        "#;
        let details = parse_torrent_detail_html("nyaa", "https://nyaa.si/view/1", html);
        assert_eq!(
            details.screenshots,
            vec![
                "https://i.kek.sh/screen1.jpg",
                "https://i.kek.sh/screen2.jpg?w=1200&h=675",
            ]
        );
    }

    #[test]
    fn detail_screenshots_fallback_skips_captcha_and_icons() {
        let html = r#"
            <html><head><title>t</title></head><body>
              <div class="comment"><div class="comment_message"><div class="user_message_c">plain text</div></div></div>
              <img src="https://animetosho.org/inc/captcha.php?h=abc" alt="captcha">
              <img src="https://images.example/real-shot.jpg">
            </body></html>
        "#;
        let details =
            parse_torrent_detail_html("erai-raws", "https://animetosho.org/view/example", html);
        assert_eq!(
            details.screenshots,
            vec!["https://images.example/real-shot.jpg"]
        );
    }

    #[test]
    fn detail_text_cleaning_fixes_paren_spacing() {
        assert_eq!(clean_detail_text("Nyaa ( cached)"), "Nyaa (cached)");
        assert_eq!(
            clean_detail_text("Magnet Link ( 1.376 GB)"),
            "Magnet Link (1.376 GB)"
        );
    }

    #[test]
    fn detail_description_preserves_line_breaks() {
        let html = r#"
            <div class="panel-body markdown-text">
                Video Info:<br>
                udp://tracker.opentrackr.org:1337/announce<br>
                S: 6292 · L: 312 · C: 19283
            </div>
        "#;
        let details = parse_torrent_detail_html("nyaa", "https://nyaa.si/view/1", html);
        assert_eq!(
            details.description,
            "Video Info:\nudp://tracker.opentrackr.org:1337/announce\nS: 6292 · L: 312 · C: 19283"
        );
    }

    #[test]
    fn detail_field_values_preserve_line_breaks() {
        let html = r#"
            <table>
                <tr><th>Download</th><td>Host1<br>Host2<br>Host3</td></tr>
                <tr><th>Extractions</th><td>Audio: GoFile | MdiaLoad<br>Subtitles: CR [eng, ASS]</td></tr>
            </table>
        "#;
        let details = parse_torrent_detail_html("nyaa", "https://nyaa.si/view/1", html);
        let download = details
            .fields
            .iter()
            .find(|field| field.label == "Download")
            .expect("Download field");
        assert_eq!(download.value, "Host1\nHost2\nHost3");
        let extractions = details
            .fields
            .iter()
            .find(|field| field.label == "Extractions")
            .expect("Extractions field");
        assert_eq!(
            extractions.value,
            "Audio: GoFile | MdiaLoad\nSubtitles: CR [eng, ASS]"
        );
    }

    #[test]
    fn nyaa_detail_parser_maps_tracker_metadata_and_file_list() {
        let html = r#"
            <h3 class="panel-title">[Erai-raws] Release</h3>
            <table>
              <tr><th>Category:</th><td>Anime - English-translated</td></tr>
              <tr><th>Date:</th><td>2025-05-04 15:21 UTC</td></tr>
              <tr><th>File size:</th><td>715.7 MiB</td></tr>
              <tr><th>Seeders:</th><td>1</td></tr>
              <tr><th>Completed:</th><td>593</td></tr>
            </table>
            <div id="torrent-description">Video Info:<br>AVC<br>Audio: AAC</div>
            <table class="files"><tr><td>episode.mkv</td><td>715.7 MiB</td></tr></table>
            <a href="/download/1.torrent">Torrent</a>
            <a href="magnet:?xt=urn:btih:ABC">Magnet</a>
        "#;
        let details = parse_torrent_detail_html("nyaa", "https://nyaa.si/view/1", html);
        assert_eq!(details.title, "[Erai-raws] Release");
        assert_eq!(details.category, "Anime - English-translated");
        assert_eq!(details.seeders, 1);
        assert_eq!(details.completed, 593);
        assert_eq!(details.files[0].name, "episode.mkv");
        assert_eq!(details.torrent_url, "https://nyaa.si/download/1.torrent");
    }

    #[test]
    fn nyaa_detail_parser_handles_bootstrap_row_layout() {
        let html = r#"
            <div class="panel panel-default">
              <div class="panel-heading"><h3 class="panel-title">[kikuri] Release</h3></div>
              <div class="panel-body">
                <div class="row">
                  <div class="col-md-1">Category:</div>
                  <div class="col-md-5"><a>Anime</a> - <a>English-translated</a></div>
                  <div class="col-md-1">Date:</div>
                  <div class="col-md-5">2026-08-12 21:12 UTC</div>
                </div>
                <div class="row">
                  <div class="col-md-1">Submitter:</div>
                  <div class="col-md-5">Anonymous</div>
                  <div class="col-md-1">Seeders:</div>
                  <div class="col-md-5"><span style="color: green;">113</span></div>
                </div>
                <div class="row">
                  <div class="col-md-1">File size:</div>
                  <div class="col-md-5">22.9 GiB</div>
                  <div class="col-md-1">Completed:</div>
                  <div class="col-md-5">533</div>
                </div>
                <div class="row">
                  <div class="col-md-offset-6 col-md-1">Info hash:</div>
                  <div class="col-md-5"><kbd>abc123</kbd></div>
                </div>
              </div>
            </div>
            <div id="torrent-description">Video Info:<br>AVC</div>
        "#;
        let details = parse_torrent_detail_html("nyaa", "https://nyaa.si/view/1", html);
        assert_eq!(details.title, "[kikuri] Release");
        assert_eq!(details.category, "Anime - English-translated");
        assert_eq!(details.seeders, 113);
        assert_eq!(details.leechers, 0);
        assert_eq!(details.completed, 533);
        assert_eq!(details.size, "22.9 GiB");
        assert_eq!(details.info_hash, "abc123");
        assert_eq!(details.uploaded_at, "2026-08-12 21:12 UTC");
        assert_eq!(details.description, "Video Info:\nAVC");
    }

    #[test]
    fn animetosho_detail_parses_comment_description_and_single_file() {
        let html = r#"
            <table>
              <tr><th>Date Submitted</th><td>27/03/2026 16:36</td></tr>
              <tr><th>Comment</th><td>Video Info:<br>AVC<br>Audio: AAC</td></tr>
              <tr><th>File Name (Size)</th><td><a>release.mkv</a> <span>(661.9 MB)</span></td></tr>
            </table>
        "#;
        let details =
            parse_torrent_detail_html("erai-raws", "https://animetosho.org/view/example", html);
        assert_eq!(details.description, "Video Info:\nAVC\nAudio: AAC");
        assert_eq!(details.files.len(), 1);
        assert_eq!(details.files[0].name, "release.mkv");
        assert_eq!(details.files[0].size, "661.9 MB");
    }

    #[test]
    fn animetosho_size_extracts_only_the_parenthesized_value() {
        assert_eq!(animetosho_size("release.mkv (661.9 MB)"), "661.9 MB");
        assert_eq!(animetosho_size("episode.mp4 (1.2 GiB)"), "1.2 GiB");
        assert_eq!(animetosho_size("22.9 GiB"), "22.9 GiB");
        assert_eq!(animetosho_size("no size here"), "");
    }

    #[test]
    fn sukebei_file_list_skips_folders_and_strips_sizes_from_names() {
        let html = r#"
            <div class="torrent-file-list panel-body">
                <ul>
                    <li><a class="folder">Root</a>
                        <ul>
                            <li><a class="folder">Frieren</a>
                                <ul>
                                    <li><i class="fa fa-file"></i>episode.mp4 <span class="file-size">(155.4 MiB)</span></li>
                                    <li><i class="fa fa-file"></i>cover.jpg <span class="file-size">(141.2 MiB)</span></li>
                                </ul>
                            </li>
                        </ul>
                    </li>
                </ul>
            </div>
        "#;
        let files = parse_detail_files(&Html::parse_document(html));
        assert_eq!(files.len(), 2);
        assert_eq!(files[0].name, "episode.mp4");
        assert_eq!(files[0].size, "(155.4 MiB)");
        assert_eq!(files[1].name, "cover.jpg");
        assert_eq!(files[1].size, "(141.2 MiB)");
    }

    #[test]
    fn animetosho_detail_stats_use_tracker_values_without_overwriting_file_metadata() {
        let html = r#"
            <body>
              Date Submitted<br>07/04/2024 02:04
              File Name (Size)<br>release.mkv (373.4 MB)
              S:<br>0<br>L:<br>0<br>C:<br>32
              S:<br>16<br>L:<br>3<br>C:<br>825
            </body>
        "#;
        let details =
            parse_torrent_detail_html("erai-raws", "https://animetosho.org/view/example", html);
        assert_eq!(details.uploaded_at, "07/04/2024 02:04");
        assert_eq!(details.seeders, 16);
        assert_eq!(details.leechers, 3);
        assert_eq!(details.completed, 825);
    }

    #[test]
    fn erai_detail_urls_allow_only_the_two_known_hosts() {
        assert!(validate_detail_url("erai-raws", "https://animetosho.org/view/1").is_ok());
        assert!(
            validate_detail_url("erai-raws", "https://www.erai-raws.info/episodes/one/").is_ok()
        );
        assert!(validate_detail_url("erai-raws", "https://erai-raws.info.evil/view/1").is_err());
    }

    fn print_detail_summary(source: &str, url: &str, details: &TorrentDetails) {
        println!("=== [{source}] {url}");
        println!("  title: {}", details.title);
        println!("  description: {} chars", details.description.len());
        println!(
            "  fields: {} (first: {:?})",
            details.fields.len(),
            details.fields.first().map(|f| &f.label)
        );
        println!(
            "  files: {} (first: {:?})",
            details.files.len(),
            details.files.first().map(|f| &f.name)
        );
        println!("  screenshots: {}", details.screenshots.len());
        println!("  comments: {}", details.comments.len());
        println!("  size: {} | category: {}", details.size, details.category);
        println!(
            "  seeders: {} | leechers: {} | completed: {} | downloads: {}",
            details.seeders, details.leechers, details.completed, details.downloads
        );
        println!(
            "  uploaded: {} | updated: {}",
            details.uploaded_at, details.updated_at
        );
        println!(
            "  magnet: {} | torrent: {}",
            details.magnet, details.torrent_url
        );
        println!("  notice: {:?}", details.notice);
    }

    #[tokio::test]
    #[ignore]
    async fn live_fetch_details_for_all_public_sources() {
        let client = build_client(None).expect("client");
        let mut fetches = Vec::new();

        let nyaa_items = search_nyaa("Frieren".to_string(), None, None, None, None, None)
            .await
            .unwrap_or_default();
        for item in nyaa_items.iter().take(3) {
            fetches.push(("nyaa", item.link.clone()));
        }

        let sukebei_items = search_sukebei("Frieren".to_string(), None, None, None, None, None)
            .await
            .unwrap_or_default();
        for item in sukebei_items.iter().take(3) {
            fetches.push(("sukebei", item.link.clone()));
        }

        let erai_items = search_erairaws("Frieren".to_string(), None, None, None)
            .await
            .unwrap_or_default();
        for item in erai_items.iter().take(3) {
            fetches.push(("erai-raws", item.link.clone()));
        }

        for (source, url) in fetches {
            if url.is_empty() {
                println!("=== [{source}] no link available");
                continue;
            }
            match client.get(&url).send().await {
                Ok(resp) if resp.status().is_success() => {
                    let html = resp.text().await.unwrap_or_default();
                    let details = parse_torrent_detail_html(source, &url, &html);
                    print_detail_summary(source, &url, &details);
                }
                Ok(resp) => {
                    println!("=== [{source}] {url} -> HTTP {}", resp.status());
                }
                Err(e) => {
                    println!("=== [{source}] {url} -> error: {e}");
                }
            }
        }
    }
}
