use futures::StreamExt;
use scraper::{Html, Selector};
use serde::Serialize;
use std::collections::HashMap;
use std::collections::HashSet;
use std::sync::LazyLock;

use ego_tree::NodeRef;

use crate::auth::{
    load_erai_cookies, load_nekobt_api_key, load_rutracker_cookies, load_rutracker_user_agent,
    rutracker_browser_fetch,
};

use super::clients::{
    absolute_detail_url, acquire_scraper_slot, build_client, build_nekobt_client,
    build_rutracker_client_with_ua, cookies_to_header, decode_rutracker_page, fetch_torrent_bytes,
    format_file_size, is_rutracker_challenge, parse_rus_number, resolve_proxy,
    rutracker_challenge_error, RUTRACKER_DEFAULT_UA,
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
static POSTER_IMG_SEL: LazyLock<Selector> = LazyLock::new(|| hardcoded_selector("img.postImg"));
static VAR_POSTIMG_SEL: LazyLock<Selector> = LazyLock::new(|| hardcoded_selector("var.postImg"));
static NICK_SEL: LazyLock<Selector> =
    LazyLock::new(|| hardcoded_selector(".poster_info .nick, .poster-info .nick"));
static BREADCRUMB_SEL: LazyLock<Selector> =
    LazyLock::new(|| hardcoded_selector(".t-breadcrumb-top a"));
static PRE_SEL: LazyLock<Selector> = LazyLock::new(|| hardcoded_selector("pre.post-pre"));
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
    hardcoded_selector("#tor-filelist li, #tor-filelist tr, #tor-filelist .file, #tor-filelist .ft-file, .filetree li, .filetree tr, .ftree li, .ftree .file, li.file, li.dir")
});
static FILE_CELL_SEL: LazyLock<Selector> = LazyLock::new(|| hardcoded_selector("td, th, span, a"));
static FILE_NESTED_SEL: LazyLock<Selector> = LazyLock::new(|| hardcoded_selector("li, tr"));
static FTREE_FILE_SEL: LazyLock<Selector> = LazyLock::new(|| hardcoded_selector("li.file > div"));
static FTREE_NAME_SEL: LazyLock<Selector> = LazyLock::new(|| hardcoded_selector("b"));
static FTREE_SIZE_SEL: LazyLock<Selector> = LazyLock::new(|| hardcoded_selector("i"));
static ANCHOR_SEL: LazyLock<Selector> = LazyLock::new(|| hardcoded_selector("a"));
static NEKO_TOOLTIP_SEL: LazyLock<Selector> =
    LazyLock::new(|| hardcoded_selector("span.tooltip[data-tip]"));
static NEKO_COVER_SEL: LazyLock<Selector> =
    LazyLock::new(|| hardcoded_selector("a[href^=\"/media/\"] img"));
static NEKO_FILE_ROW_SEL: LazyLock<Selector> = LazyLock::new(|| hardcoded_selector("ul.menu > li"));
static NEKO_SERIES_SEL: LazyLock<Selector> = LazyLock::new(|| hardcoded_selector(".card-body h2"));
static SPAN_SEL: LazyLock<Selector> = LazyLock::new(|| hardcoded_selector("span"));

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

/// One rich block of a rutracker release description, in document order.
///
/// Anything the renderer does not understand degrades to [`DescriptionBlock::Text`],
/// so old frontends keep working: they ignore unknown `kind` values.
#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum DescriptionBlock {
    Heading { text: String },
    Text { text: String },
    Field { label: String, value: String },
    Image { src: String },
    Spoiler { title: String, body: String },
    Code { text: String },
    Link { text: String, href: String },
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
    pub poster: Option<String>,
    pub mediainfo: Option<String>,
    pub author: String,
    pub description_blocks: Vec<DescriptionBlock>,
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

const FOOTER_WORDS: &[&str] = &["помощь", "донаты", "donations", "donate"];

fn is_footer_line(line: &str) -> bool {
    let mut words = 0;
    for token in line.split(['|', '·', '•', '/', '\\']) {
        let token = token
            .trim()
            .trim_matches(|c: char| "—–-·•*:;\"'«»()".contains(c))
            .trim()
            .to_lowercase();
        if token.is_empty() {
            continue;
        }
        if !FOOTER_WORDS.contains(&token.as_str()) {
            return false;
        }
        words += 1;
    }
    words > 0
}

/// Drops trailing forum-footer lines ("Помощь | Донаты | Donations")
/// that releases append after the actual description.
fn strip_trailing_footer(text: &str) -> String {
    let mut lines: Vec<&str> = text.lines().collect();
    while let Some(last) = lines.last() {
        if last.trim().is_empty() || is_footer_line(last) {
            lines.pop();
        } else {
            break;
        }
    }
    lines.join("\n")
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

    let bootstrap_fields = parse_bootstrap_detail_fields(doc);
    for field in bootstrap_fields {
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
    "logo",
    "avatar",
    "icon",
    "emoji",
    "emoticon",
    "smilie",
    "smiley",
    "captcha",
    "spacer",
    "pixel",
    "blank",
    "rating",
    "bullet",
    "arrow",
    "banner",
    "favicon",
    "imageset",
    "/styles/",
    "loading",
    "userbar",
    "1x1",
    "q_icon",
    "edited",
    "online",
    "offline",
    "flag_",
    "smiles",
    "/flags/",
    "imdb",
    "kinopoisk",
];

const POSTIMG_SMILEY_CLASS: &str = "postimg1em";

fn is_postimg_smiley(class: &str) -> bool {
    class
        .split_whitespace()
        .any(|token| token == POSTIMG_SMILEY_CLASS)
}

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
    let url = upgrade_to_https(url);
    if url.starts_with("https://") && !images.contains(&url) {
        images.push(url);
    }
}

/// Rutracker topics mix `http://` and `https://` image hosts. Web views
/// block plain-http subresources on secure pages, so normalize everything
/// to `https://` — the image hosts rutracker uses all serve TLS.
fn upgrade_to_https(url: String) -> String {
    url.strip_prefix("http://")
        .map(|rest| format!("https://{rest}"))
        .unwrap_or(url)
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
    if images.len() >= limit {
        return;
    }
    collect_var_postimgs(element, origin, images, limit);
}

/// Rutracker renders attached images as `<var class="postImg" title="URL">`
/// (thumbnail inside a link to the full image). Plain `img` collection
/// misses them entirely.
fn collect_var_postimgs(
    element: scraper::ElementRef<'_>,
    origin: &str,
    images: &mut Vec<String>,
    limit: usize,
) {
    let var_sel = VAR_POSTIMG_SEL.clone();
    for var in element.select(&var_sel) {
        let title = var.value().attr("title").unwrap_or_default();
        if title.trim().is_empty() {
            continue;
        }
        push_image_src(title, origin, images);
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

const POSTER_LINK_EXTS: &[&str] = &[".jpg", ".jpeg", ".png", ".webp", ".gif"];

fn poster_link_target(href: &str) -> Option<&str> {
    let clean = href.split(['?', '#']).next().unwrap_or_default();
    let lower = clean.to_lowercase();
    POSTER_LINK_EXTS
        .iter()
        .any(|ext| lower.ends_with(ext))
        .then_some(href)
}

fn pick_poster_src(src: &str, class: &str, origin: &str) -> Option<String> {
    if src.trim().is_empty() || is_image_noise(class, &src.to_lowercase()) {
        return None;
    }
    let url = upgrade_to_https(absolute_detail_url(origin, src));
    url.starts_with("https://").then_some(url)
}

fn is_aligned_poster(class: &str) -> bool {
    class
        .split_whitespace()
        .any(|token| token == "postimgaligned" || token == "img-right")
}

fn image_src<'a>(value: &'a scraper::ElementRef<'a>) -> &'a str {
    let element = value.value();
    element
        .attr("data-original")
        .or_else(|| element.attr("data-src"))
        .or_else(|| element.attr("src"))
        .unwrap_or_default()
}

fn spoiler_is_screenshots(spoiler: &scraper::ElementRef<'_>) -> bool {
    let heading = spoiler
        .select(&SPOILER_HEAD_SEL.clone())
        .next()
        .map(element_text)
        .unwrap_or_default()
        .to_lowercase();
    let class = spoiler
        .value()
        .attr("class")
        .unwrap_or_default()
        .to_lowercase();
    heading.contains("скриншот") || heading.contains("screenshot") || class.contains("screenshot")
}

fn spoiler_src_sets(post: &scraper::ElementRef<'_>) -> (HashSet<String>, HashSet<String>) {
    let mut screenshots = HashSet::new();
    let mut others = HashSet::new();
    let spoiler_sel = SPOILER_SEL.clone();
    let image_sel = IMAGE_SEL.clone();
    let anchor_sel = ANCHOR_SEL.clone();
    for spoiler in post.select(&spoiler_sel) {
        let target = if spoiler_is_screenshots(&spoiler) {
            &mut screenshots
        } else {
            &mut others
        };
        for image in spoiler.select(&image_sel) {
            target.insert(image_src(&image).to_string());
        }
        for var in spoiler.select(&VAR_POSTIMG_SEL.clone()) {
            target.insert(var.value().attr("title").unwrap_or_default().to_string());
        }
        for link in spoiler.select(&anchor_sel) {
            target.insert(link.value().attr("href").unwrap_or_default().to_string());
        }
    }
    (screenshots, others)
}

fn element_class(value: &scraper::ElementRef<'_>) -> String {
    value
        .value()
        .attr("class")
        .unwrap_or_default()
        .to_lowercase()
}

fn parse_rutracker_poster(doc: &Html, origin: &str) -> Option<String> {
    let post = doc.select(&POST_BODY_SEL.clone()).next()?;
    let (screenshot_srcs, other_spoiler_srcs) = spoiler_src_sets(&post);
    let outside_spoilers =
        |src: &str| !screenshot_srcs.contains(src) && !other_spoiler_srcs.contains(src);
    let not_screenshot = |src: &str| !screenshot_srcs.contains(src);
    let real_poster = |image: &scraper::ElementRef<'_>| {
        let class = element_class(image);
        if is_postimg_smiley(&class) {
            return None;
        }
        pick_poster_src(image_src(image), &class, origin)
    };
    for image in post.select(&POSTER_IMG_SEL.clone()) {
        let class = element_class(&image);
        if !is_aligned_poster(&class) {
            continue;
        }
        let src = image_src(&image);
        if !outside_spoilers(src) {
            continue;
        }
        if let Some(url) = real_poster(&image) {
            return Some(url);
        }
    }
    for image in post.select(&POSTER_IMG_SEL.clone()) {
        let src = image_src(&image);
        if !outside_spoilers(src) {
            continue;
        }
        if let Some(url) = real_poster(&image) {
            return Some(url);
        }
    }
    // Poster can also be a `<var class="postImg" title="URL">` outside spoilers.
    for var in post.select(&VAR_POSTIMG_SEL.clone()) {
        let title = var.value().attr("title").unwrap_or_default();
        if !outside_spoilers(title) {
            continue;
        }
        if let Some(url) = pick_poster_src(title, &element_class(&var), origin) {
            return Some(url);
        }
    }
    for image in post.select(&POSTER_IMG_SEL.clone()) {
        let src = image_src(&image);
        if !not_screenshot(src) {
            continue;
        }
        if let Some(url) = real_poster(&image) {
            return Some(url);
        }
    }
    for image in post.select(&IMAGE_SEL.clone()) {
        let src = image_src(&image);
        if !outside_spoilers(src) {
            continue;
        }
        if let Some(url) = real_poster(&image) {
            return Some(url);
        }
    }
    for link in post.select(&ANCHOR_SEL.clone()) {
        let href = link.value().attr("href").unwrap_or_default();
        let Some(target) = poster_link_target(href) else {
            continue;
        };
        if !not_screenshot(target) {
            continue;
        }
        if let Some(url) = pick_poster_src(target, &element_class(&link), origin) {
            return Some(url);
        }
    }
    None
}

fn spoiler_is_mediainfo(spoiler: &scraper::ElementRef<'_>) -> bool {
    spoiler
        .select(&SPOILER_HEAD_SEL.clone())
        .next()
        .map(element_text)
        .unwrap_or_default()
        .to_lowercase()
        .contains("mediainfo")
}

const MAX_MEDIAINFO_CHARS: usize = 8000;

fn looks_like_mediainfo(text: &str) -> bool {
    text.contains("General") && (text.contains("Complete name") || text.contains("File size"))
}

fn truncate_mediainfo(text: String) -> String {
    if text.len() > MAX_MEDIAINFO_CHARS {
        let mut cut = text[..MAX_MEDIAINFO_CHARS].to_string();
        cut.push_str("\n…");
        cut
    } else {
        text
    }
}

/// Raw `MediaInfo` dump from the `MediaInfo` spoiler, if the topic has one.
fn parse_rutracker_mediainfo(doc: &Html) -> Option<String> {
    let post = doc.select(&POST_BODY_SEL.clone()).next()?;
    let body_sel = SPOILER_BODY_SEL.clone();
    for spoiler in post.select(&SPOILER_SEL.clone()) {
        if !spoiler_is_mediainfo(&spoiler) {
            continue;
        }
        let area = spoiler.select(&body_sel).next().unwrap_or(spoiler);
        let text = element_text_multiline(area);
        let text = text.trim().to_string();
        if text.is_empty() {
            continue;
        }
        return Some(truncate_mediainfo(text));
    }
    // Fallback: MediaInfo is often pasted as `<pre class="post-pre">` under
    // a differently-titled spoiler (or none at all).
    for pre in post.select(&PRE_SEL.clone()) {
        let text = element_text_multiline(pre);
        let text = text.trim().to_string();
        if looks_like_mediainfo(&text) {
            return Some(truncate_mediainfo(text));
        }
    }
    None
}

/// Show poster from an erai-raws.info anime page: the first content
/// upload image, skipping plugin emoticons and theme chrome.
fn parse_erai_poster(doc: &Html, origin: &str) -> Option<String> {
    doc.select(&IMAGE_SEL.clone()).find_map(|image| {
        let src = image_src(&image);
        let lower = src.to_lowercase();
        if !lower.contains("/wp-content/uploads/") {
            return None;
        }
        pick_poster_src(src, &element_class(&image), origin)
    })
}

/// Uploader nick from the first post (`.poster_info .nick`).
fn parse_rutracker_author(doc: &Html) -> String {
    doc.select(&NICK_SEL.clone())
        .next()
        .map(element_text)
        .unwrap_or_default()
}

/// Forum breadcrumb, e.g. "Аниме / Японская анимация".
fn parse_rutracker_category(doc: &Html) -> String {
    doc.select(&BREADCRUMB_SEL.clone())
        .map(element_text)
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" / ")
}

/// Forum titles use inline `font-size: 24px` / `20px` headings.
fn bb_font_size_px(style: &str) -> Option<u32> {
    for part in style.split(';') {
        let (name, value) = part.split_once(':')?;
        if name.trim().eq_ignore_ascii_case("font-size") {
            let digits: String = value
                .trim()
                .chars()
                .take_while(char::is_ascii_digit)
                .collect();
            if let Ok(size) = digits.parse() {
                return Some(size);
            }
        }
    }
    None
}

fn node_classes(node: NodeRef<'_, scraper::node::Node>) -> String {
    node.value()
        .as_element()
        .map(|el| el.attr("class").unwrap_or_default().to_lowercase())
        .unwrap_or_default()
}

fn node_text(node: NodeRef<'_, scraper::node::Node>) -> String {
    if let Some(text) = node.value().as_text() {
        let slice: &str = text;
        return slice.to_string();
    }
    node.descendants()
        .filter_map(|child| {
            child.value().as_text().map(|text| {
                let slice: &str = text;
                slice.to_string()
            })
        })
        .collect::<String>()
}

struct DescriptionBuilder<'a> {
    origin: &'a str,
    blocks: Vec<DescriptionBlock>,
    paragraph: String,
}

const MAX_DESCRIPTION_BLOCKS: usize = 200;
const HEADING_MIN_PX: u32 = 18;

impl DescriptionBuilder<'_> {
    fn push_text(&mut self, text: &str) {
        if text.trim().is_empty() {
            return;
        }
        if !self.paragraph.is_empty() && !self.paragraph.ends_with(' ') {
            self.paragraph.push(' ');
        }
        self.paragraph.push_str(text.trim());
    }

    fn flush_paragraph(&mut self) {
        let text = clean_detail_text(std::mem::take(&mut self.paragraph));
        if !text.is_empty() {
            self.blocks.push(DescriptionBlock::Text { text });
        }
    }

    fn push_image(&mut self, src: &str) {
        self.flush_paragraph();
        if self.blocks.len() >= MAX_DESCRIPTION_BLOCKS {
            return;
        }
        if let Some(url) = pick_poster_src(src, "", self.origin) {
            self.blocks.push(DescriptionBlock::Image { src: url });
        }
    }

    fn is_full(&self) -> bool {
        self.blocks.len() >= MAX_DESCRIPTION_BLOCKS
    }
}

fn walk_description_children(
    element: scraper::ElementRef<'_>,
    builder: &mut DescriptionBuilder<'_>,
) {
    let children: Vec<_> = element.children().collect();
    let mut index = 0;
    while index < children.len() && !builder.is_full() {
        index = visit_description_child(builder, &children, index);
    }
    builder.flush_paragraph();
}

fn visit_description_child(
    builder: &mut DescriptionBuilder<'_>,
    siblings: &[NodeRef<'_, scraper::node::Node>],
    index: usize,
) -> usize {
    let node = siblings[index];
    if node.value().as_text().is_some() {
        builder.push_text(&node_text(node));
        return index + 1;
    }
    let Some(element) = scraper::ElementRef::wrap(node) else {
        return index + 1;
    };
    let name = element.value().name();
    let class = node_classes(node);
    match name {
        "br" | "hr" => {
            builder.flush_paragraph();
        }
        "img" => {
            let src = image_src(&element);
            let is_smiley = class.split_whitespace().any(|token| {
                token == "smile"
                    || token == POSTIMG_SMILEY_CLASS
                    || token.contains("smiley")
                    || token.contains("smilie")
            });
            if !is_smiley && !src.trim().is_empty() {
                builder.push_image(src);
            }
        }
        "var" if class.split_whitespace().any(|token| token == "postimg") => {
            let title = element.value().attr("title").unwrap_or_default();
            builder.push_image(title);
        }
        "span" | "font" | "b" | "u" | "i" | "em" | "strong" | "big" | "small" => {
            if class.split_whitespace().any(|token| token == "post-b") {
                return visit_post_field(builder, siblings, index, element);
            }
            let big_title = element
                .value()
                .attr("style")
                .and_then(bb_font_size_px)
                .is_some_and(|size| size >= HEADING_MIN_PX)
                || class.split_whitespace().any(|token| token == "post-align");
            if big_title {
                builder.flush_paragraph();
                let text = clean_detail_text(node_text(*element));
                if !text.is_empty() {
                    builder.blocks.push(DescriptionBlock::Heading { text });
                }
            } else {
                builder.push_text(&node_text(*element));
            }
        }
        "a" => {
            return visit_description_link(builder, siblings, index, element);
        }
        "div"
            if class.split_whitespace().any(|token| token == "sp-wrap")
                || class.contains("spoiler")
                || class.contains("spoil") =>
        {
            builder.flush_paragraph();
            if !spoiler_is_screenshots(&element) {
                let title = element
                    .select(&SPOILER_HEAD_SEL.clone())
                    .next()
                    .map(element_text)
                    .unwrap_or_default();
                let body = element
                    .select(&SPOILER_BODY_SEL.clone())
                    .next()
                    .map(element_text_multiline)
                    .unwrap_or_default();
                let body = strip_trailing_footer(&body);
                if !body.trim().is_empty() && !builder.is_full() {
                    builder.blocks.push(DescriptionBlock::Spoiler {
                        title: title.trim().to_string(),
                        body: body.trim().to_string(),
                    });
                }
            }
        }
        "pre" => {
            builder.flush_paragraph();
            let text = element_text_multiline(element).trim().to_string();
            if !text.is_empty() && !looks_like_mediainfo(&text) && !builder.is_full() {
                builder.blocks.push(DescriptionBlock::Code { text });
            }
        }
        "ul" | "ol" => {
            builder.flush_paragraph();
            for item in element.children().filter_map(scraper::ElementRef::wrap) {
                if item.value().name() == "li" && !builder.is_full() {
                    let text = clean_detail_text(node_text(*item));
                    if !text.is_empty() {
                        builder.blocks.push(DescriptionBlock::Text {
                            text: format!("• {text}"),
                        });
                    }
                }
            }
        }
        "table" | "script" | "style" => {}
        _ => {
            walk_description_children(element, builder);
        }
    }
    index + 1
}

/// `<span class="post-b">Label</span>: value<br>` rows become fields.
fn visit_post_field(
    builder: &mut DescriptionBuilder<'_>,
    siblings: &[NodeRef<'_, scraper::node::Node>],
    index: usize,
    element: scraper::ElementRef<'_>,
) -> usize {
    builder.flush_paragraph();
    let label = clean_detail_text(node_text(*element))
        .trim_end_matches(':')
        .trim()
        .to_string();
    let mut value = String::new();
    let mut cursor = index + 1;
    while cursor < siblings.len() {
        let sibling = siblings[cursor];
        if let Some(el) = scraper::ElementRef::wrap(sibling) {
            let sibling_name = el.value().name();
            if ["br", "hr", "div", "table", "pre", "ul", "ol"].contains(&sibling_name) {
                break;
            }
            if sibling_name == "span"
                && node_classes(sibling)
                    .split_whitespace()
                    .any(|token| token == "post-b")
            {
                break;
            }
            value.push_str(&node_text(sibling));
            value.push(' ');
        } else {
            value.push_str(&node_text(sibling));
            value.push(' ');
        }
        cursor += 1;
    }
    let value = clean_detail_text(value);
    let value = value.trim_start_matches(':').trim().to_string();
    if !label.is_empty() && !value.is_empty() && !builder.is_full() {
        builder
            .blocks
            .push(DescriptionBlock::Field { label, value });
    } else if !value.is_empty() {
        builder.push_text(&value);
    }
    cursor
}

fn visit_description_link(
    builder: &mut DescriptionBuilder<'_>,
    siblings: &[NodeRef<'_, scraper::node::Node>],
    index: usize,
    element: scraper::ElementRef<'_>,
) -> usize {
    let href = element.value().attr("href").unwrap_or_default();
    if href.starts_with("magnet:") {
        return index + 1;
    }
    let image_sel = IMAGE_SEL.clone();
    let var_sel = VAR_POSTIMG_SEL.clone();
    let shot = element
        .select(&image_sel)
        .next()
        .map(|image| image_src(&image).to_string())
        .filter(|src| !src.trim().is_empty())
        .or_else(|| {
            element
                .select(&var_sel)
                .next()
                .map(|var| var.value().attr("title").unwrap_or_default().to_string())
                .filter(|title| !title.trim().is_empty())
        });
    if let Some(src) = shot {
        builder.push_image(&src);
        return index + 1;
    }
    let _ = siblings;
    builder.flush_paragraph();
    let text = clean_detail_text(node_text(*element));
    if text.is_empty() {
        return index + 1;
    }
    if href.trim().is_empty() || href.starts_with('#') {
        builder.push_text(&text);
    } else if !builder.is_full() {
        let absolute = absolute_detail_url(builder.origin, href);
        builder.blocks.push(DescriptionBlock::Link {
            text,
            href: absolute,
        });
    }
    index + 1
}

/// Rich release-description blocks from the first post, in document order.
fn parse_rutracker_description_blocks(doc: &Html, origin: &str) -> Vec<DescriptionBlock> {
    let Some(post) = doc.select(&POST_BODY_SEL.clone()).next() else {
        return Vec::new();
    };
    let mut builder = DescriptionBuilder {
        origin,
        blocks: Vec::new(),
        paragraph: String::new(),
    };
    walk_description_children(post, &mut builder);
    builder.blocks
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
        if !spoiler_is_screenshots(&spoiler) {
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
    // Exact pass for the native `.ftree` markup:
    // `li.file > div > b` (name) + `i` (size). `li.dir` folders are
    // containers by construction and never match `li.file > div`.
    let exact = parse_rutracker_ftree_files(&doc);
    if !exact.is_empty() {
        return exact;
    }
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

fn parse_rutracker_ftree_files(doc: &Html) -> Vec<TorrentDetailFile> {
    const MAX_FTREE_FILES: usize = 500;
    let mut files = Vec::new();
    for row in doc.select(&FTREE_FILE_SEL.clone()) {
        let name = row
            .select(&FTREE_NAME_SEL.clone())
            .next()
            .map(element_text)
            .unwrap_or_default();
        if name.is_empty() || name.len() > 500 {
            continue;
        }
        let size = row
            .select(&FTREE_SIZE_SEL.clone())
            .next()
            .map(element_text)
            .filter(|size| looks_like_file_size(size))
            .unwrap_or_default();
        if !files
            .iter()
            .any(|file: &TorrentDetailFile| file.name == name)
        {
            files.push(TorrentDetailFile { name, size });
        }
        if files.len() >= MAX_FTREE_FILES {
            break;
        }
    }
    files
}

/// File list decoded from raw `.torrent` bytes (pure, no network).
fn files_from_torrent_bytes(bytes: &[u8]) -> Vec<TorrentDetailFile> {
    crate::bencode::extract_torrent_files(bytes)
        .map(|entries| {
            entries
                .into_iter()
                .map(|(name, size)| TorrentDetailFile {
                    name,
                    size: format_file_size(size as f64),
                })
                .collect()
        })
        .unwrap_or_default()
}

async fn fetch_rutracker_file_tree(
    app_handle: &tauri::AppHandle,
    client: &reqwest::Client,
    cookies: &HashMap<String, String>,
    topic_id: &str,
    allow_browser: bool,
) -> Result<String, String> {
    let file_tree_url = format!("https://rutracker.org/forum/viewtorrent.php?t={topic_id}");
    let browser_response = if allow_browser {
        rutracker_browser_fetch(app_handle, &file_tree_url).await?
    } else {
        None
    };
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

#[derive(Default)]
struct NekobtMeta {
    seeders: u32,
    leechers: u32,
    downloads: u32,
    size: String,
    uploader: String,
    uploaded_at: String,
    info_hash: String,
}

fn is_relative_time_tip(tip: &str) -> bool {
    let tip = tip.trim().to_lowercase();
    ["second", "minute", "hour", "day", "week", "month", "year"]
        .iter()
        .any(|unit| tip.contains(unit) && tip.contains("ago"))
}

/// Stats live in `span.tooltip[data-tip="Seeders|Leechers|…"]`; the span
/// text after the icon svg is the value.
fn parse_nekobt_meta(doc: &Html) -> NekobtMeta {
    let mut meta = NekobtMeta::default();
    for span in doc.select(&NEKO_TOOLTIP_SEL.clone()) {
        let tip = span
            .value()
            .attr("data-tip")
            .unwrap_or_default()
            .trim()
            .to_string();
        let value = element_text(span);
        match tip.as_str() {
            "Seeders" => meta.seeders = parse_rus_number(&value),
            "Leechers" => meta.leechers = parse_rus_number(&value),
            "Downloads" => meta.downloads = parse_rus_number(&value),
            "Total Size" => meta.size = value,
            "Uploader" => meta.uploader = value,
            "Infohash" => meta.info_hash = value.to_lowercase(),
            _ => {
                if is_relative_time_tip(&tip) && meta.uploaded_at.is_empty() {
                    meta.uploaded_at = value;
                }
            }
        }
    }
    meta
}

/// Sidebar cover: `a[href^="/media/"] img` (AniList CDN).
fn parse_nekobt_cover(doc: &Html, origin: &str) -> Option<String> {
    doc.select(&NEKO_COVER_SEL.clone())
        .next()
        .and_then(|image| image.value().attr("src"))
        .and_then(|src| {
            let url = absolute_detail_url(origin, src);
            url.starts_with("https://").then_some(url)
        })
}

/// File rows: `ul.menu > li > span(flex justify-between)` with the name in
/// the first *leaf* span and the size in the last one (container spans
/// aggregate the whole row text and must be skipped).
fn parse_nekobt_files(doc: &Html) -> Vec<TorrentDetailFile> {
    const MAX_NEKO_FILES: usize = 500;
    let mut files = Vec::new();
    for row in doc.select(&NEKO_FILE_ROW_SEL.clone()) {
        let spans: Vec<String> = row
            .select(&SPAN_SEL.clone())
            .filter(|span| span.select(&SPAN_SEL.clone()).next().is_none())
            .map(element_text)
            .filter(|part| !part.is_empty())
            .collect();
        if spans.len() < 2 {
            continue;
        }
        let name = spans[0].clone();
        let size = spans[spans.len() - 1].clone();
        if name.is_empty() || name.len() > 500 {
            continue;
        }
        if !files
            .iter()
            .any(|file: &TorrentDetailFile| file.name == name)
        {
            files.push(TorrentDetailFile { name, size });
        }
        if files.len() >= MAX_NEKO_FILES {
            break;
        }
    }
    files
}

/// Direct `.torrent` download served by the JSON API endpoint.
fn parse_nekobt_torrent_url(doc: &Html, origin: &str) -> String {
    let link_sel = ANCHOR_SEL.clone();
    for link in doc.select(&link_sel) {
        let href = link.value().attr("href").unwrap_or_default();
        if href.contains("/api/v1/torrents/") && href.contains("download") {
            return absolute_detail_url(origin, href);
        }
    }
    String::new()
}

/// Series title from the sidebar card (`h2`).
fn parse_nekobt_series(doc: &Html) -> String {
    doc.select(&NEKO_SERIES_SEL.clone())
        .next()
        .map(element_text)
        .unwrap_or_default()
}

pub fn parse_torrent_detail_html(source: &str, url: &str, html: &str) -> TorrentDetails {
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
    if source == "rutracker" {
        description = strip_trailing_footer(&description);
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
                // Erai-raws serves files from its own CDN host.
                let erai_cdn = source == "erai-raws"
                    && url::Url::parse(&candidate)
                        .ok()
                        .and_then(|parsed| parsed.host_str().map(str::to_string))
                        .is_some_and(|host| {
                            host == "ddl.erai-raws.info" || host.ends_with(".erai-raws.info")
                        });
                if same_origin || erai_cdn {
                    torrent_url = candidate;
                }
            }
        }
    }
    if source == "nekobt" && torrent_url.is_empty() {
        torrent_url = parse_nekobt_torrent_url(&doc, origin);
    }
    let category = if source == "rutracker" {
        let breadcrumb = parse_rutracker_category(&doc);
        if breadcrumb.is_empty() {
            detail_field(&fields, &["category", "раздел", "категория"])
        } else {
            breadcrumb
        }
    } else {
        detail_field(&fields, &["category", "раздел", "категория"])
    };
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
    let neko_meta = if source == "nekobt" {
        parse_nekobt_meta(&doc)
    } else {
        NekobtMeta::default()
    };
    let neko_series = if source == "nekobt" {
        parse_nekobt_series(&doc)
    } else {
        String::new()
    };
    let (size, uploaded_at, seeders, leechers, downloads, info_hash) = if source == "nekobt" {
        (
            neko_meta.size.clone(),
            neko_meta.uploaded_at.clone(),
            neko_meta.seeders,
            neko_meta.leechers,
            neko_meta.downloads,
            neko_meta.info_hash.clone(),
        )
    } else {
        (size, uploaded_at, seeders, leechers, downloads, info_hash)
    };
    if source == "nekobt" && description.is_empty() && !neko_series.is_empty() {
        description = neko_series.clone();
    }
    let files = if source == "rutracker" {
        Vec::new()
    } else if source == "nekobt" {
        parse_nekobt_files(&doc)
    } else if source == "erai-raws" && parse_detail_files(&doc).is_empty() {
        parse_animetosho_file(&doc)
    } else {
        parse_detail_files(&doc)
    };
    let mut screenshots = parse_detail_screenshots(&doc, origin, source);
    let poster = if source == "rutracker" {
        parse_rutracker_poster(&doc, origin)
    } else if source == "nekobt" {
        parse_nekobt_cover(&doc, origin)
    } else if source == "erai-raws" {
        parse_erai_poster(&doc, origin)
    } else {
        None
    };
    if let Some(url) = &poster {
        if !screenshots.contains(url) {
            screenshots.insert(0, url.clone());
        }
    }
    let mediainfo = if source == "rutracker" {
        parse_rutracker_mediainfo(&doc)
    } else {
        None
    };
    let author = if source == "rutracker" {
        parse_rutracker_author(&doc)
    } else if source == "nekobt" {
        neko_meta.uploader.clone()
    } else {
        String::new()
    };
    let description_blocks = if source == "rutracker" {
        parse_rutracker_description_blocks(&doc, origin)
    } else {
        Vec::new()
    };
    let comments = parse_detail_comments(&doc, source);
    let has_details = !description.is_empty()
        || !fields.is_empty()
        || !files.is_empty()
        || !screenshots.is_empty()
        || mediainfo.is_some()
        || !description_blocks.is_empty()
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
        poster,
        mediainfo,
        author,
        description_blocks,
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
    let proxy = resolve_proxy(proxy_url.clone(), proxyUrl.clone());
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
        // Public pages (title, poster) work anonymously, like search;
        // episode content unlocks once the user logs in, so attach
        // cookies only when a session exists instead of hard-failing.
        let cookies = load_erai_cookies();
        if !cookies.is_empty() {
            request = request.header("Cookie", cookies_to_header(&cookies));
        }
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
        std::borrow::Cow::Owned(decode_rutracker_page(&body))
    } else {
        String::from_utf8_lossy(&body)
    };
    if source == "rutracker" && is_rutracker_challenge(&html) {
        return Err(rutracker_challenge_error());
    }
    let mut details = parse_torrent_detail_html(&source, &url, &html);

    if source == "rutracker" {
        let cookies = load_rutracker_cookies(&app_handle);
        if let Some(topic_id) = rutracker_topic_id(&url) {
            if let Ok(file_tree) = fetch_rutracker_file_tree(
                &app_handle,
                &client,
                &cookies,
                &topic_id,
                proxy.is_none(),
            )
            .await
            {
                details.files = parse_rutracker_file_tree(&file_tree);
            }
            // The `viewtorrent.php` fragment can come back empty (or fail
            // silently on challenges). The `.torrent` itself always carries
            // the exact file list, so use it as the fallback source.
            if details.files.is_empty() {
                if let Ok(bytes) = crate::auth::rutracker_get_torrent_bytes(
                    app_handle.clone(),
                    topic_id,
                    proxy_url.clone(),
                    proxyUrl.clone(),
                )
                .await
                {
                    details.files = files_from_torrent_bytes(&bytes);
                }
            }
        }
    }

    if details.title.is_empty() {
        details.title = origin.to_string();
    }

    // Non-rutracker sources have no separate file-list endpoint: when the
    // page carries no files but points at a `.torrent`, decode the list
    // from the torrent metadata itself.
    if source != "rutracker" && details.files.is_empty() && details.torrent_url.starts_with("http")
    {
        if let Ok(bytes) =
            fetch_torrent_bytes(details.torrent_url.clone(), proxy_url, proxyUrl).await
        {
            details.files = files_from_torrent_bytes(&bytes);
        }
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
    fn nekobt_tooltip_stats_cover_files_and_torrent_url() {
        let html = r#"
            <html><body>
              <span class="flex-0 inline-flex items-center gap-0.5 tooltip" data-tip="Seeders"><svg></svg> 177</span>
              <span class="flex-0 inline-flex items-center gap-0.5 tooltip" data-tip="Leechers"><svg></svg> 1</span>
              <span class="flex-0 inline-flex items-center gap-0.5 tooltip" data-tip="Downloads"><svg></svg> 2645</span>
              <span class="flex-0 inline-flex items-center gap-0.5 tooltip" data-tip="Total Size"><svg></svg> 1.35 GiB</span>
              <span class="flex-0 inline-flex items-center gap-0.5 tooltip" data-tip="Uploader"><svg></svg> Erai-raws</span>
              <span class="flex-0 inline-flex items-center gap-0.5 tooltip" data-tip="16 days ago">2026-09-23 13:30:54</span>
              <span class="flex-0 inline-flex items-center gap-0.5 tooltip" data-tip="Infohash"><svg></svg> 965C2B17A72B05515E8193EF33FCAA748C78CFEF</span>
              <div class="col-span-12 md:col-span-3"><div class="card bg-base-200"><div class="card-body text-center">
                <a href="/media/s1453?al=135865"><img src="https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx135865-T7XIPMAbqcxN.png"></a>
                <h2 class="w-fit text-xl mx-auto">Saga of Tanya the Evil<span>(2017)</span></h2>
              </div></div></div>
              <h2>Files</h2>
              <ul class="menu w-full"><li><span class="flex justify-between items-center">
                <span class="flex-1 min-w-0"><span style="overflow-wrap: anywhere">[Erai-raws] Youjo Senki II - 12.mkv</span></span>
                <span>1.35 GiB</span>
              </span></li></ul>
              <a class="link-blue" href="magnet:?xt=urn:btih:965c2b17a72b05515e8193ef33fcaa748c78cfef">Magnet</a>
              <a class="link-blue" href="/api/v1/torrents/13947047670024/download?public=true">dl</a>
            </body></html>
        "#;
        let details =
            parse_torrent_detail_html("nekobt", "https://nekobt.to/torrents/13947047670024", html);
        assert_eq!(details.seeders, 177);
        assert_eq!(details.leechers, 1);
        assert_eq!(details.downloads, 2645);
        assert_eq!(details.size, "1.35 GiB");
        assert_eq!(details.uploaded_at, "2026-09-23 13:30:54");
        assert_eq!(details.author, "Erai-raws");
        assert_eq!(
            details.info_hash,
            "965c2b17a72b05515e8193ef33fcaa748c78cfef"
        );
        assert_eq!(
            details.poster.as_deref(),
            Some("https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx135865-T7XIPMAbqcxN.png")
        );
        assert_eq!(details.files.len(), 1);
        assert_eq!(details.files[0].name, "[Erai-raws] Youjo Senki II - 12.mkv");
        assert_eq!(details.files[0].size, "1.35 GiB");
        assert_eq!(
            details.torrent_url,
            "https://nekobt.to/api/v1/torrents/13947047670024/download?public=true"
        );
        assert!(details.magnet.starts_with("magnet:?xt=urn:btih:"));
    }

    #[test]
    fn erai_poster_prefers_content_uploads_over_emoticons() {
        let html = r#"
            <html><body>
              <article><div class="inside-article">
                <img src="https://www.erai-raws.info/wp-content/uploads/2026/01/Show-768x1100.jpg">
                <img src="https://www.erai-raws.info/wp-content/plugins/wpdiscuz-emoticons/emoticons/img/smile.svg" class="wpdem-editor-sticker">
              </div></article>
            </body></html>
        "#;
        let details = parse_torrent_detail_html(
            "erai-raws",
            "https://www.erai-raws.info/anime-list/show/",
            html,
        );
        assert_eq!(
            details.poster.as_deref(),
            Some("https://www.erai-raws.info/wp-content/uploads/2026/01/Show-768x1100.jpg")
        );
    }

    #[test]
    fn erai_torrent_download_allows_own_cdn_host() {
        let html = r#"
            <html><body>
              <table><tr><td>Source Links</td></tr>
              <tr><td><a href="https://ddl.erai-raws.info/Torrent/2005/Fall/Akagi/[Erai-raws] Akagi.torrent">Torrent Download</a></td></tr>
              <tr><td><a href="https://evil.example/file.torrent">evil</a></td></tr>
            </body></html>
        "#;
        let details = parse_torrent_detail_html(
            "erai-raws",
            "https://animetosho.org/view/erai-raws-akagi.n1",
            html,
        );
        assert_eq!(
            details.torrent_url,
            "https://ddl.erai-raws.info/Torrent/2005/Fall/Akagi/[Erai-raws] Akagi.torrent"
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
    fn rutracker_footer_lines_are_stripped_from_description() {
        let html = r#"
            <html><body>
              <div class="post_body">
                Real description here.
                <br>Помощь | Донаты | Donations
              </div>
            </body></html>
        "#;
        let details = parse_torrent_detail_html(
            "rutracker",
            "https://rutracker.org/forum/viewtopic.php?t=9",
            html,
        );
        assert_eq!(details.description, "Real description here.");
        assert!(!details.description.contains("Донаты"));
    }

    #[test]
    fn rutracker_poster_prefers_postimg_outside_spoilers() {
        let html = r#"
            <html><body>
              <div class="post_body">
                <img class="postImg" src="https://img.rutracker.org/f/009/poster.jpg">
                <div class="sp-wrap">
                  <div class="sp-head">Скриншоты</div>
                  <div class="sp-body"><img src="https://img.rutracker.org/f/009/shot1.jpg"></div>
                </div>
              </div>
            </body></html>
        "#;
        let details = parse_torrent_detail_html(
            "rutracker",
            "https://rutracker.org/forum/viewtopic.php?t=9",
            html,
        );
        assert_eq!(
            details.poster.as_deref(),
            Some("https://img.rutracker.org/f/009/poster.jpg")
        );
        assert_eq!(
            details.screenshots[0],
            "https://img.rutracker.org/f/009/poster.jpg"
        );
    }

    #[test]
    fn rutracker_screenshots_include_var_postimg_thumbs() {
        let html = r#"
            <html><body>
              <div class="post_body">
                <img class="postImg postImgAligned img-right" src="https://i2.imageban.ru/out/2023/11/16/poster.jpg">
                <div class="sp-wrap">
                  <div class="sp-head folded"><span>Скриншоты</span></div>
                  <div class="sp-body">
                    <a href="https://imageban.ru/show/2023/11/16/aaa/png" class="postLink"><var class="postImg" title="https://i5.imageban.ru/thumbs/2023.11.16/aaa.png"></var></a>
                    <a href="https://imageban.ru/show/2023/11/16/bbb/png" class="postLink"><var class="postImg" title="https://i3.imageban.ru/thumbs/2023.11.16/bbb.png"></var></a>
                  </div>
                </div>
              </div>
            </body></html>
        "#;
        let details = parse_torrent_detail_html(
            "rutracker",
            "https://rutracker.org/forum/viewtopic.php?t=6442370",
            html,
        );
        assert_eq!(
            details.poster.as_deref(),
            Some("https://i2.imageban.ru/out/2023/11/16/poster.jpg")
        );
        assert!(details
            .screenshots
            .contains(&"https://i5.imageban.ru/thumbs/2023.11.16/aaa.png".to_string()));
        assert!(details
            .screenshots
            .contains(&"https://i3.imageban.ru/thumbs/2023.11.16/bbb.png".to_string()));
    }

    #[test]
    fn rutracker_poster_ignores_smiley_and_rating_buttons() {
        let html = r#"
            <html><body>
              <div class="post_body">
                <img class="postImg postImg1em" alt="pic" src="https://static.rutracker.cc/smiles/143.gif">
                <img class="postImg" src="https://static.rutracker.cc/pic/buttons/imdb.png">
                <img class="postImg" src="http://www.kinopoisk.ru/rating/5078200.gif">
                <img class="postImg postImgAligned img-right" src="https://i2.imageban.ru/out/2023/11/16/poster.jpg">
                <div class="sp-wrap">
                  <div class="sp-head folded"><span>Скриншоты</span></div>
                  <div class="sp-body"><var class="postImg" title="https://i5.imageban.ru/thumbs/2023.11.16/aaa.png"></var></div>
                </div>
              </div>
            </body></html>
        "#;
        let details = parse_torrent_detail_html(
            "rutracker",
            "https://rutracker.org/forum/viewtopic.php?t=6442370",
            html,
        );
        assert_eq!(
            details.poster.as_deref(),
            Some("https://i2.imageban.ru/out/2023/11/16/poster.jpg")
        );
    }

    #[test]
    fn rutracker_poster_upgrades_http_and_prefers_aligned() {
        let html = r#"
            <html><body>
              <div class="post_body">
                <img class="postImg" src="https://static.rutracker.cc/pic/buttons/imdb.png">
                <img class="postImg postImgAligned img-right" alt="pic" src="http://i2.imageban.ru/out/2023/11/16/poster.jpg">
                <div class="sp-wrap">
                  <div class="sp-head folded"><span>Скриншоты</span></div>
                  <div class="sp-body"><var class="postImg" title="https://i5.imageban.ru/thumbs/2023.11.16/aaa.png"></var></div>
                </div>
              </div>
            </body></html>
        "#;
        let details = parse_torrent_detail_html(
            "rutracker",
            "https://rutracker.org/forum/viewtopic.php?t=6442370",
            html,
        );
        assert_eq!(
            details.poster.as_deref(),
            Some("https://i2.imageban.ru/out/2023/11/16/poster.jpg")
        );
    }

    #[test]
    fn rutracker_mediainfo_author_and_category_are_extracted() {
        let html = r#"
            <html><body>
              <table><tbody><tr><td class="nav t-breadcrumb-top w100 pad_2">
                <a href="https://rutracker.org/forum/index.php?c=2">Кино, Видео и ТВ</a>
                <em>|</em> <a href="https://rutracker.org/forum/viewforum.php?f=33">Мульты</a>
              </td></tr></tbody></table>
              <table><tbody id="post_1" class="row1"><tr>
                <td class="poster_info td1"><p class="nick nick-author">Edik1d1</p></td>
                <td class="message td2"><div class="post_body">
                  <img class="postImg" src="https://i2.imageban.ru/out/poster.jpg">
                  <div class="sp-wrap">
                    <div class="sp-head folded"><span>MediaInfo</span></div>
                    <div class="sp-body"><pre class="post-pre">General<br>Format : Matroska<br>File size : 3.56 GiB</pre></div>
                  </div>
                </div></td>
              </tr></tbody></table>
            </body></html>
        "#;
        let details = parse_torrent_detail_html(
            "rutracker",
            "https://rutracker.org/forum/viewtopic.php?t=6442370",
            html,
        );
        assert_eq!(details.author, "Edik1d1");
        assert_eq!(details.category, "Кино, Видео и ТВ / Мульты");
        let mediainfo = details.mediainfo.expect("mediainfo must be extracted");
        assert!(mediainfo.contains("General"));
        assert!(mediainfo.contains("3.56 GiB"));
    }

    #[test]
    fn rutracker_mediainfo_falls_back_to_bare_pre_block() {
        let html = r#"
            <html><body>
              <div class="post_body">
                <div class="sp-wrap">
                  <div class="sp-head folded"><span>Технические данные</span></div>
                  <div class="sp-body"><pre class="post-pre">General<br>Complete name : movie.mkv<br>File size : 1.00 GiB</pre></div>
                </div>
              </div>
            </body></html>
        "#;
        let details = parse_torrent_detail_html(
            "rutracker",
            "https://rutracker.org/forum/viewtopic.php?t=9",
            html,
        );
        let mediainfo = details.mediainfo.expect("mediainfo must be extracted");
        assert!(mediainfo.contains("General"));
        assert!(mediainfo.contains("1.00 GiB"));
    }

    #[test]
    fn rutracker_mediainfo_ignores_unrelated_pre_blocks() {
        let html = r#"
            <html><body>
              <div class="post_body">
                <pre class="post-pre">Just some formatted text</pre>
              </div>
            </body></html>
        "#;
        let details = parse_torrent_detail_html(
            "rutracker",
            "https://rutracker.org/forum/viewtopic.php?t=9",
            html,
        );
        assert!(details.mediainfo.is_none());
    }

    #[test]
    fn files_from_torrent_bytes_formats_entries() {
        let torrent = b"d4:infod5:filesld6:lengthi1048576e4:pathl11:episode.mkveed6:lengthi2097152e4:pathl9:other.mkveee4:name4:root12:piece lengthi16384e6:pieces20:01234567890123456789ee";
        let files = files_from_torrent_bytes(torrent);
        assert_eq!(files.len(), 2);
        assert_eq!(files[0].name, "episode.mkv");
        assert_eq!(files[0].size, "1.00 MiB");
        assert_eq!(files[1].size, "2.00 MiB");
        assert!(files_from_torrent_bytes(b"not a torrent").is_empty());
    }

    #[test]
    fn rutracker_file_tree_counts_only_leaf_files_inside_dirs() {
        let html = r#"
            <div id="tor-filelist"><ul class="ftree">
              <li class="dir"><div><b>Season 1</b><s>2 files</s></div><ul>
                <li class="file"><div><b>episode-01.mkv</b><i>635 MiB</i></div></li>
                <li class="file"><div><b>episode-02.mkv</b><i>640 MiB</i></div></li>
              </ul></li>
            </ul></div>
        "#;
        let files = parse_rutracker_file_tree(html);
        assert_eq!(files.len(), 2);
        assert_eq!(files[0].name, "episode-01.mkv");
        assert_eq!(files[0].size, "635 MiB");
        assert_eq!(files[1].name, "episode-02.mkv");
    }

    #[test]
    fn rutracker_description_blocks_capture_release_structure() {
        let html = r#"
            <html><body>
              <div class="post_body">
                <span class="post-align" style="text-align: center;"><span style="font-size: 24px;">Monster / Goodbye Monster</span></span>
                <img class="postImg postImgAligned img-right" src="https://i2.imageban.ru/out/poster.jpg">
                <span class="post-b">Год выпуска</span>: 2022<br>
                <span class="post-b">Студия</span>: Sunac Pictures<br>
                Some intro text here.
                <div class="sp-wrap">
                  <div class="sp-head folded"><span>Доп. информация</span></div>
                  <div class="sp-body">Extra details inside.</div>
                </div>
                <div class="sp-wrap">
                  <div class="sp-head folded"><span>Скриншоты</span></div>
                  <div class="sp-body"><var class="postImg" title="https://i5.imageban.ru/thumbs/shot.png"></var></div>
                </div>
                <a class="postLink" href="https://www.kinopoisk.ru/film/123/">Kinopoisk page</a>
              </div>
            </body></html>
        "#;
        let details = parse_torrent_detail_html(
            "rutracker",
            "https://rutracker.org/forum/viewtopic.php?t=6442370",
            html,
        );
        let kinds: Vec<&str> = details
            .description_blocks
            .iter()
            .map(|block| match block {
                DescriptionBlock::Heading { .. } => "heading",
                DescriptionBlock::Text { .. } => "text",
                DescriptionBlock::Field { .. } => "field",
                DescriptionBlock::Image { .. } => "image",
                DescriptionBlock::Spoiler { .. } => "spoiler",
                DescriptionBlock::Code { .. } => "code",
                DescriptionBlock::Link { .. } => "link",
            })
            .collect();
        assert!(kinds.contains(&"heading"), "kinds: {kinds:?}");
        assert!(kinds.contains(&"field"), "kinds: {kinds:?}");
        assert!(kinds.contains(&"image"), "kinds: {kinds:?}");
        assert!(kinds.contains(&"spoiler"), "kinds: {kinds:?}");
        assert!(kinds.contains(&"link"), "kinds: {kinds:?}");
        assert!(
            !kinds.contains(&"code"),
            "screenshots spoiler must not leak into blocks: {kinds:?}"
        );
        let field = details
            .description_blocks
            .iter()
            .find_map(|block| match block {
                DescriptionBlock::Field { label, value } => Some((label.clone(), value.clone())),
                _ => None,
            });
        assert_eq!(field, Some(("Год выпуска".to_string(), "2022".to_string())));
        let spoiler = details
            .description_blocks
            .iter()
            .find_map(|block| match block {
                DescriptionBlock::Spoiler { title, body } => Some((title.clone(), body.clone())),
                _ => None,
            });
        assert!(spoiler.is_some());
        assert!(spoiler.unwrap_or_default().0.contains("Доп. информация"));
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
