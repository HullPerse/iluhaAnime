//! Kodik player resolution.
//!
//! AnimeLib hands out a Kodik player URL per voice-over row, for example
//! `//kodikplayer.com/seria/176463/<hash>/720p`. Kodik is where the media
//! actually lives; mpv cannot open the player page, so the page has to be
//! asked for its stream links first.
//!
//! The flow is the one the player itself runs in a browser:
//!
//! 1. GET the player page with the referer of the site that embeds it. Kodik
//!    checks that referer and answers its partner-access page otherwise.
//! 2. Read the signed `urlParams` form out of the page. The current page wants
//!    `d`, `d_sign`, `pd`, `pd_sign`, `ref`, `ref_sign` and the player id
//!    triple posted to its own server. A page without that form falls back to
//!    the older endpoint: read the `app.player_single` script, decode the
//!    endpoint passed to `atob(...)`, and post the id triple with the extra
//!    flags that endpoint expects.
//! 3. Every `src` in the answer is a Caesar rotation of a base64 string. All 27
//!    shifts are tried and the first result that is an http(s) URL wins.
//!
//! Media requests carry the player page as their referer and the browser
//! User-Agent, which is what the CDN sees from the real player.

use std::collections::{BTreeMap, HashMap};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use base64::Engine as _;
use serde::Deserialize;

use crate::stream::anime_lib_models::{AudioTrack, StreamResolutionError, StreamVariant};

/// How much of an unexpected body is quoted back in the error message.
const BODY_SNIPPET: usize = 200;
/// The Caesar alphabet length the link decoder rotates over.
const ALPHABET: u8 = 26;
/// The endpoint every page form is signed for.
const FORM_ENDPOINT: &str = "/ftor";
/// A refusal page is reported before any parsing is attempted.
const GEO_MARKER: &str = "запрещено к просмотру";

#[derive(Debug, Deserialize)]
struct PlayerResponse {
    #[serde(default)]
    links: BTreeMap<String, Vec<PlayerLink>>,
}

#[derive(Debug, Deserialize)]
struct PlayerLink {
    #[serde(default)]
    src: String,
    #[serde(default, rename = "type")]
    media_type: String,
}

/// The `seria|video|season / id / hash` triple the endpoint expects.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlayerRef {
    pub kind: String,
    pub id: String,
    pub hash: String,
}

/// A resolved Kodik link: one playable URL with the quality it belongs to.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KodikStream {
    pub quality: String,
    pub url: String,
    pub media_type: String,
}

impl KodikStream {
    fn container(&self) -> &'static str {
        container_of(&self.media_type, &self.url)
    }
}

/// Turn a Kodik player URL into playable links.
///
/// `referer` is the site that embeds the player, not the player itself: Kodik
/// serves its access page when the referer is its own host.
pub async fn resolve(
    source_url: &str,
    referer: &str,
    audio_tracks: Vec<AudioTrack>,
    variant_id: &str,
    proxy: Option<&str>,
) -> Result<Vec<StreamVariant>, StreamResolutionError> {
    let player_url = absolute_player_url(source_url)?;
    let parsed =
        url::Url::parse(&player_url).map_err(|error| StreamResolutionError::UnsupportedFormat {
            message: format!("kodik url is not valid: {player_url}: {error}"),
        })?;
    let host = parsed
        .host_str()
        .ok_or_else(|| StreamResolutionError::UnsupportedFormat {
            message: format!("kodik url has no host: {player_url}"),
        })?
        .to_string();
    let reference =
        player_ref(&player_url).ok_or_else(|| StreamResolutionError::UnsupportedFormat {
            message: format!("kodik url has no player id: {player_url}"),
        })?;

    let mut builder = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .user_agent(super::anime_lib_client::USER_AGENT)
        .cookie_store(true);
    if let Some(url) = proxy.map(str::trim).filter(|url| !url.is_empty()) {
        builder = builder.proxy(reqwest::Proxy::all(url).map_err(|error| {
            StreamResolutionError::NetworkError {
                message: format!("invalid kodik proxy {url}: {error}"),
            }
        })?);
    }
    let client = builder
        .build()
        .map_err(|error| StreamResolutionError::NetworkError {
            message: format!("failed to create kodik client: {error}"),
        })?;

    let media_headers = media_headers(&player_url);
    let mut last_error: Option<StreamResolutionError> = None;
    for _ in 0..2 {
        let html = fetch_text(
            &client,
            &player_url,
            referer,
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        )
        .await?;
        if let Some(message) = refusal_message(&html) {
            return Err(StreamResolutionError::GeoBlocked { message });
        }

        let streams = match page_form(&html) {
            Some(form) => {
                let server = form
                    .get("pd")
                    .map(|value| decode_field(value))
                    .filter(|value| !value.is_empty())
                    .unwrap_or_else(|| host.clone());
                let body = page_form_body(&form, &reference);
                post_links(
                    &client,
                    &format!("https://{server}{FORM_ENDPOINT}"),
                    &RequestBody::Raw(body),
                    &player_url,
                    &host,
                )
                .await
            }
            None => {
                let endpoint = match cached_endpoint(&host) {
                    Some(endpoint) => endpoint,
                    None => {
                        let endpoint = discover_endpoint(&client, &html, &player_url).await?;
                        cache_endpoint(&host, &endpoint);
                        endpoint
                    }
                };
                post_links(
                    &client,
                    &format!("https://{host}{endpoint}"),
                    &RequestBody::Fields(legacy_form(&reference)),
                    &player_url,
                    &host,
                )
                .await
            }
        };

        match streams {
            Ok(found) if !found.is_empty() => {
                return Ok(found
                    .into_iter()
                    .map(|stream| {
                        let container = stream.container().to_string();
                        StreamVariant {
                            variant_id: variant_id.to_string(),
                            quality: stream.quality.clone(),
                            label: format!("{}p", stream.quality),
                            url: stream.url,
                            r#type: container,
                            headers: media_headers.clone(),
                            subtitles: Vec::new(),
                            audio_tracks: audio_tracks.clone(),
                        }
                    })
                    .collect());
            }
            Ok(_) => {
                last_error = Some(StreamResolutionError::UnsupportedFormat {
                    message: format!("kodik answered without stream links for {player_url}"),
                });
            }
            Err(error) => {
                last_error = Some(error);
            }
        }

        forget_endpoint(&host);
    }

    Err(
        last_error.unwrap_or_else(|| StreamResolutionError::NetworkError {
            message: format!("kodik did not answer for {player_url}"),
        }),
    )
}

/// `//host/path` becomes `https://host/path`. Anything that is not http(s)
/// after that is rejected: mpv is never handed another scheme.
pub fn absolute_player_url(source_url: &str) -> Result<String, StreamResolutionError> {
    let trimmed = source_url.trim();
    let with_scheme = if let Some(rest) = trimmed.strip_prefix("//") {
        format!("https://{rest}")
    } else {
        trimmed.to_string()
    };
    if with_scheme.starts_with("http://") || with_scheme.starts_with("https://") {
        Ok(with_scheme)
    } else {
        Err(StreamResolutionError::UnsupportedFormat {
            message: format!("kodik source is not an http url: {source_url}"),
        })
    }
}

/// Read `type`, `id` and `hash` from `/seria/1211977/<hash>/720p`.
pub fn player_ref(url: &str) -> Option<PlayerRef> {
    let parsed = url::Url::parse(url).ok()?;
    let segments: Vec<&str> = parsed
        .path_segments()?
        .filter(|segment| !segment.is_empty())
        .collect();
    let id_index = segments.iter().position(|segment| {
        !segment.is_empty() && segment.chars().all(|character| character.is_ascii_digit())
    })?;
    if id_index == 0 {
        return None;
    }
    let hash = *segments.get(id_index + 1)?;
    if hash.len() < 8
        || !hash
            .chars()
            .all(|character| character.is_ascii_alphanumeric())
    {
        return None;
    }
    Some(PlayerRef {
        kind: segments[id_index - 1].to_string(),
        id: segments[id_index].to_string(),
        hash: hash.to_string(),
    })
}

/// The signed form the current player page carries: `urlParams = '<json>'`.
pub fn page_form(html: &str) -> Option<BTreeMap<String, String>> {
    let marker = html.find("urlParams")?;
    let rest = html.get(marker..)?;
    let equals = rest.find('=')?;
    let rest = rest.get(equals + 1..)?.trim_start();
    let quote = rest.chars().next()?;
    if quote != '\'' && quote != '"' {
        return None;
    }
    let body = rest.get(1..)?;
    let end = body.find(quote)?;
    let raw: BTreeMap<String, serde_json::Value> = serde_json::from_str(body.get(..end)?).ok()?;
    let form: BTreeMap<String, String> = raw
        .into_iter()
        .filter_map(|(key, value)| value.as_str().map(|text| (key, text.to_string())))
        .collect();
    let signed = form.get("d_sign").is_some_and(|value| !value.is_empty());
    signed.then_some(form)
}

/// The body the page posts to `/ftor`. `d`, `pd` and the ids go as they appear
/// in `urlParams`; the signed values are percent-decoded first, exactly like
/// the page's own form code.
pub fn page_form_body(form: &BTreeMap<String, String>, reference: &PlayerRef) -> String {
    let raw = |key: &str| form.get(key).cloned().unwrap_or_default();
    let decoded = |key: &str| decode_field(&raw(key));
    let fields = [
        ("d", raw("d")),
        ("d_sign", decoded("d_sign")),
        ("pd", raw("pd")),
        ("pd_sign", decoded("pd_sign")),
        ("ref", decoded("ref")),
        ("ref_sign", decoded("ref_sign")),
        ("type", reference.kind.clone()),
        ("id", reference.id.clone()),
        ("hash", reference.hash.clone()),
    ];
    fields
        .iter()
        .map(|(key, value)| format!("{key}={}", urlencoding::encode(value)))
        .collect::<Vec<_>>()
        .join("&")
}

/// The `app.player_single` script the player page loads.
pub fn player_script_path(html: &str) -> Option<&str> {
    let marker = html.find("app.player_single")?;
    let open = html.get(..marker)?.rfind("src=\"")? + "src=\"".len();
    let rest = html.get(open..)?;
    let end = rest.find('"')?;
    let path = &rest[..end];
    path.starts_with('/').then_some(path)
}

/// The base64 endpoint the player script passes to `atob(...)`.
pub fn script_endpoint(script: &str) -> Option<String> {
    let mut cursor = 0;
    while let Some(tail) = script.get(cursor..) {
        let found = tail.find("atob(")?;
        let open = cursor + found + "atob(".len();
        cursor = open;
        let Some(rest) = script.get(open..) else {
            break;
        };
        let quote = rest.chars().next()?;
        if quote != '"' && quote != '\'' {
            continue;
        }
        let body = rest.get(1..)?;
        let Some(end) = body.find(quote) else {
            continue;
        };
        let Ok(decoded) = decode_base64_text(&body[..end]) else {
            continue;
        };
        if decoded.starts_with('/') && !decoded.contains(char::is_whitespace) {
            return Some(decoded);
        }
    }
    None
}

/// Read the links out of a Kodik endpoint answer.
///
/// Every quality key maps to one or more mirrors; the first decodable mirror
/// wins so a quality is offered once.
pub fn parse_links(body: &str) -> Option<Vec<KodikStream>> {
    let response: PlayerResponse = serde_json::from_str(body).ok()?;
    let mut streams: Vec<KodikStream> = Vec::new();
    for (quality, links) in response.links {
        for link in links {
            if link.src.trim().is_empty() {
                continue;
            }
            let Some(url) = decode_link(&link.src) else {
                continue;
            };
            streams.push(KodikStream {
                quality: quality.clone(),
                url,
                media_type: link.media_type,
            });
            break;
        }
    }
    streams.sort_by_key(|stream| std::cmp::Reverse(numeric_quality(&stream.quality)));
    if streams.is_empty() {
        None
    } else {
        Some(streams)
    }
}

/// Kodik encodes each `src` with a Caesar rotation followed by base64. Both
/// layers are reversible, so the shift is tried instead of guessed.
///
/// The payload is either an absolute URL or a protocol-relative one
/// (`//cloud2.solodcdn.com/...`), which is what the signed answer carries.
pub fn decode_link(encoded: &str) -> Option<String> {
    if let Some(url) = absolute_media_url(encoded) {
        return Some(url);
    }
    (0..=ALPHABET).find_map(|shift| {
        let rotated = rotate_back(encoded, shift);
        let decoded = decode_base64_text(&rotated).ok()?;
        absolute_media_url(&decoded)
    })
}

/// An http(s) URL or a `//host/path` one, which becomes `https://host/path`.
/// Anything else, including an empty host, is not a playable link.
fn absolute_media_url(value: &str) -> Option<String> {
    let candidate = match value.strip_prefix("//") {
        Some(rest) if !rest.is_empty() => format!("https://{rest}"),
        _ => value.to_string(),
    };
    let parsed = url::Url::parse(&candidate).ok()?;
    (parsed.host_str().is_some_and(|host| !host.is_empty())
        && matches!(parsed.scheme(), "http" | "https"))
    .then_some(candidate)
}

fn rotate_back(text: &str, shift: u8) -> String {
    text.chars()
        .map(|character| {
            if !character.is_ascii_alphabetic() {
                return character;
            }
            let base = if character.is_ascii_lowercase() {
                b'a'
            } else {
                b'A'
            };
            let position = character as u8 - base;
            (base + (position + ALPHABET - shift) % ALPHABET) as char
        })
        .collect()
}

fn decode_base64_text(encoded: &str) -> Result<String, ()> {
    let mut value = encoded.trim().to_string();
    while value.len() % 4 != 0 {
        value.push('=');
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(value)
        .map_err(|_| ())?;
    String::from_utf8(bytes).map_err(|_| ())
}

fn decode_field(value: &str) -> String {
    urlencoding::decode(value)
        .map(|decoded| decoded.into_owned())
        .unwrap_or_else(|_| value.to_string())
}

fn container_of(media_type: &str, url: &str) -> &'static str {
    if url.contains(".m3u8") {
        return "m3u8";
    }
    match media_type.to_ascii_lowercase().as_str() {
        "application/x-mpegurl" | "application/vnd.apple.mpegurl" => "m3u8",
        "video/mp4" => "mp4",
        "application/dash+xml" => "dash",
        _ => "unknown",
    }
}

fn numeric_quality(quality: &str) -> i32 {
    quality
        .chars()
        .filter(char::is_ascii_digit)
        .collect::<String>()
        .parse()
        .unwrap_or(0)
}

/// Kodik's own words for a refused page, or `None` when the page is a player.
///
/// Only the visible error box counts. Every normal player page carries a
/// `support@kodikres.com` HTML comment, so that string cannot be used as a
/// refusal marker; a page without the comment is not a page Kodik refused.
pub fn refusal_message(body: &str) -> Option<String> {
    // The player page ships its error box as a JS template on every page, so
    // only markup outside `<script>` counts as a real message.
    let visible = without_scripts(body);
    let message = page_message(&visible)?;
    if visible.contains(GEO_MARKER) || message.contains(GEO_MARKER) {
        return Some(format!(
            "Kodik refused the video for this region: {message}"
        ));
    }
    Some(format!("Kodik refused this client: {message}"))
}

/// Drop `<script>...</script>` blocks so text a page would render at runtime is
/// not mistaken for rendered markup.
fn without_scripts(body: &str) -> String {
    let mut out = String::with_capacity(body.len());
    let mut rest = body;
    while let Some(open) = rest.find("<script") {
        let Some(close) = rest[open..].find("</script>") else {
            break;
        };
        out.push_str(&rest[..open]);
        rest = &rest[open + close + "</script>".len()..];
    }
    out.push_str(rest);
    out
}

fn page_message(body: &str) -> Option<String> {
    let marker = body.find("class=\"message\"")?;
    let rest = body.get(marker..)?;
    let start = rest.find('>')? + 1;
    let end = rest.get(start..)?.find("</div>")?;
    let text = rest.get(start..start + end)?.trim();
    (!text.is_empty()).then(|| text.to_string())
}

/// Whatever text an HTML error page carries, with tags removed.
fn plain_text(body: &str) -> String {
    let mut text = String::with_capacity(body.len().min(2000));
    let mut inside_tag = false;
    for character in body.chars() {
        match character {
            '<' => inside_tag = true,
            '>' => {
                inside_tag = false;
                text.push(' ');
            }
            _ if !inside_tag => text.push(character),
            _ => {}
        }
    }
    text.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(BODY_SNIPPET)
        .collect()
}

fn media_headers(player_url: &str) -> BTreeMap<String, String> {
    let mut headers = BTreeMap::new();
    headers.insert("Referer".to_string(), player_url.to_string());
    headers.insert(
        "User-Agent".to_string(),
        super::anime_lib_client::USER_AGENT.to_string(),
    );
    headers
}

fn legacy_form(reference: &PlayerRef) -> Vec<(String, String)> {
    vec![
        ("type".to_string(), reference.kind.clone()),
        ("hash".to_string(), reference.hash.clone()),
        ("id".to_string(), reference.id.clone()),
        ("bad_user".to_string(), "True".to_string()),
        ("info".to_string(), "{}".to_string()),
        ("cdn_is_working".to_string(), "True".to_string()),
    ]
}

fn endpoint_cache() -> &'static Mutex<HashMap<String, String>> {
    static CACHE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn cached_endpoint(host: &str) -> Option<String> {
    endpoint_cache()
        .lock()
        .ok()
        .and_then(|cache| cache.get(host).cloned())
}

fn cache_endpoint(host: &str, endpoint: &str) {
    if let Ok(mut cache) = endpoint_cache().lock() {
        cache.insert(host.to_string(), endpoint.to_string());
    }
}

fn forget_endpoint(host: &str) {
    if let Ok(mut cache) = endpoint_cache().lock() {
        cache.remove(host);
    }
}

enum RequestBody {
    Fields(Vec<(String, String)>),
    Raw(String),
}

async fn post_links(
    client: &reqwest::Client,
    url: &str,
    body: &RequestBody,
    player_url: &str,
    host: &str,
) -> Result<Vec<KodikStream>, StreamResolutionError> {
    let mut request = client
        .post(url)
        .header("Accept", "application/json, text/javascript, */*; q=0.01")
        .header("X-Requested-With", "XMLHttpRequest")
        .header("Referer", player_url)
        .header("Origin", format!("https://{host}"));
    request = match body {
        RequestBody::Fields(fields) => request.form(fields),
        RequestBody::Raw(raw) => request
            .header("Content-Type", "application/x-www-form-urlencoded")
            .body(raw.clone()),
    };

    let response = request
        .send()
        .await
        .map_err(|error| StreamResolutionError::NetworkError {
            message: format!("kodik request failed: {error}"),
        })?;
    let status = response.status();
    let answer = response
        .text()
        .await
        .map_err(|error| StreamResolutionError::NetworkError {
            message: format!("failed to read kodik body: {error}"),
        })?;

    if answer.contains(GEO_MARKER) {
        return Err(StreamResolutionError::GeoBlocked {
            message: refusal_message(&answer)
                .unwrap_or_else(|| "Kodik refused the video for this region".to_string()),
        });
    }
    if status == reqwest::StatusCode::FORBIDDEN || status == reqwest::StatusCode::GONE {
        return Err(StreamResolutionError::ExpiredUrl {
            message: format!("kodik answered {status} for {url}: the link has expired"),
        });
    }
    if !status.is_success() {
        return Err(StreamResolutionError::NetworkError {
            message: format!("kodik answered {status} for {url}: {}", plain_text(&answer)),
        });
    }

    parse_links(&answer).ok_or_else(|| StreamResolutionError::UnsupportedFormat {
        message: format!(
            "kodik answered {status} for {url} and no stream links were found in it: {}",
            plain_text(&answer)
        ),
    })
}

async fn discover_endpoint(
    client: &reqwest::Client,
    html: &str,
    player_url: &str,
) -> Result<String, StreamResolutionError> {
    let script_path =
        player_script_path(html).ok_or_else(|| StreamResolutionError::UnsupportedFormat {
            message: format!(
                "kodik answered {player_url} with a page that has no player script: {}",
                plain_text(html)
            ),
        })?;
    let script_url = url::Url::parse(player_url)
        .and_then(|base| base.join(script_path))
        .map_err(|error| StreamResolutionError::UnsupportedFormat {
            message: format!("kodik player script path is not a url: {script_path}: {error}"),
        })?;
    let script = fetch_text(
        client,
        script_url.as_str(),
        player_url,
        "application/javascript,*/*;q=0.8",
    )
    .await?;

    script_endpoint(&script).ok_or_else(|| StreamResolutionError::UnsupportedFormat {
        message: format!(
            "kodik player script {} has no api endpoint: {}",
            script_url,
            plain_text(&script)
        ),
    })
}

async fn fetch_text(
    client: &reqwest::Client,
    url: &str,
    referer: &str,
    accept: &str,
) -> Result<String, StreamResolutionError> {
    let response = client
        .get(url)
        .header("Accept", accept)
        .header("Referer", referer)
        .send()
        .await
        .map_err(|error| StreamResolutionError::NetworkError {
            message: format!("kodik request failed: {error}"),
        })?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| StreamResolutionError::NetworkError {
            message: format!("failed to read kodik body: {error}"),
        })?;

    if body.contains(GEO_MARKER) {
        return Err(StreamResolutionError::GeoBlocked {
            message: refusal_message(&body)
                .unwrap_or_else(|| "Kodik refused the video for this region".to_string()),
        });
    }
    if !status.is_success() {
        return Err(StreamResolutionError::NetworkError {
            message: format!("kodik answered {status} for {url}: {}", plain_text(&body)),
        });
    }

    Ok(body)
}

#[cfg(test)]
mod tests {
    use super::*;

    const PAGE: &str = r#"<html><head>
        <script type="text/javascript" src="/assets/js/app.player_single.0a909e421830a888.js"></script>
    </head></html>"#;

    const SCRIPT: &str = r#"$.ajax({type:"POST",url:atob("L2Z0b3I="),data:videoInfo});"#;

    fn reference() -> PlayerRef {
        PlayerRef {
            kind: "seria".to_string(),
            id: "1211977".to_string(),
            hash: "d5a209e95d68094e346175d7357ef0c7".to_string(),
        }
    }

    /// Kodik rotates the base64 text, not the URL, so the fixture encodes in
    /// the same order and with the padding stripped.
    fn encode_link(url: &str, shift: u8) -> String {
        let encoded = base64::engine::general_purpose::STANDARD.encode(url.as_bytes());
        encoded
            .trim_end_matches('=')
            .chars()
            .map(|character| {
                if !character.is_ascii_alphabetic() {
                    return character;
                }
                let base = if character.is_ascii_lowercase() {
                    b'a'
                } else {
                    b'A'
                };
                let position = character as u8 - base;
                (base + (position + shift) % ALPHABET) as char
            })
            .collect()
    }

    #[test]
    fn protocol_relative_source_becomes_https() {
        assert_eq!(
            absolute_player_url("//kodikplayer.com/seria/1/hash/720p").expect("valid"),
            "https://kodikplayer.com/seria/1/hash/720p"
        );
        assert_eq!(
            absolute_player_url("https://kodikplayer.com/seria/1/hash/720p").expect("valid"),
            "https://kodikplayer.com/seria/1/hash/720p"
        );
    }

    #[test]
    fn a_non_http_source_is_rejected() {
        assert!(matches!(
            absolute_player_url("ftp://kodik.example/stream"),
            Err(StreamResolutionError::UnsupportedFormat { .. })
        ));
        assert!(matches!(
            absolute_player_url(""),
            Err(StreamResolutionError::UnsupportedFormat { .. })
        ));
    }

    #[test]
    fn the_player_id_triple_comes_from_the_path() {
        let parsed = player_ref(
            "https://kodikplayer.com/seria/1211977/d5a209e95d68094e346175d7357ef0c7/720p",
        )
        .expect("player ref");
        assert_eq!(parsed.kind, "seria");
        assert_eq!(parsed.id, "1211977");
        assert_eq!(parsed.hash, "d5a209e95d68094e346175d7357ef0c7");
        assert!(player_ref("https://kodikplayer.com/").is_none());
    }

    #[test]
    fn the_script_path_is_read_from_the_src_attribute() {
        assert_eq!(
            player_script_path(PAGE).expect("script path"),
            "/assets/js/app.player_single.0a909e421830a888.js"
        );
        assert!(player_script_path("<html><body>no player</body></html>").is_none());
    }

    #[test]
    fn the_endpoint_is_base64_inside_atob() {
        assert_eq!(script_endpoint(SCRIPT).expect("endpoint"), "/ftor");
        assert!(script_endpoint("$.ajax({url: '/elsewhere'})").is_none());
        assert!(script_endpoint("nothing here").is_none());
    }

    #[test]
    fn the_signed_page_form_is_read_from_urlparams() {
        let html = r#"<script>var urlParams = '{"d":"abc%3D","d_sign":"abc%253D","pd":"kodikplayer.com","pd_sign":"x%253D","ref":"","ref_sign":"y%253D"}';</script>"#;
        let form = page_form(html).expect("form");
        assert_eq!(form.get("d").map(String::as_str), Some("abc%3D"));
        assert_eq!(form.get("pd").map(String::as_str), Some("kodikplayer.com"));
        assert!(page_form("<html></html>").is_none());
        assert!(page_form(r#"<script>var urlParams = '{"d":"1"}';</script>"#).is_none());
    }

    #[test]
    fn the_page_form_body_carries_the_signed_values_and_the_ids() {
        let html = r#"<script>var urlParams = '{"d":"aa%3D","d_sign":"bb%253D","pd":"kodikplayer.com","pd_sign":"cc%253D","ref":"https%3A%2F%2Fanimelib.org%2F","ref_sign":"dd%253D"}';</script>"#;
        let form = page_form(html).expect("form");
        let body = page_form_body(&form, &reference());

        // `d` and the signed values are already percent-encoded once, so the
        // body encodes them a second time; the server decodes its form once.
        assert!(body.contains("d=aa%253D"));
        assert!(body.contains("d_sign=bb%253D"));
        assert!(body.contains("pd=kodikplayer.com"));
        assert!(body.contains("pd_sign=cc%253D"));
        assert!(body.contains("ref=https%3A%2F%2Fanimelib.org%2F"));
        assert!(body.contains("ref_sign=dd%253D"));
        assert!(body.contains("type=seria"));
        assert!(body.contains("id=1211977"));
        assert!(body.contains("hash=d5a209e95d68094e346175d7357ef0c7"));
    }

    #[test]
    fn an_encoded_link_decodes_back_to_the_manifest() {
        let url = "https://p13.example.cdn/s/m/hash:2026050102/720.mp4:hls:manifest.m3u8";
        for shift in 0..=ALPHABET {
            let encoded = encode_link(url, shift);
            assert_eq!(decode_link(&encoded).as_deref(), Some(url), "shift {shift}");
        }
    }

    #[test]
    fn a_plain_url_is_left_alone() {
        assert_eq!(
            decode_link("https://cdn.example/720.mp4").as_deref(),
            Some("https://cdn.example/720.mp4")
        );
        assert!(decode_link("not a url").is_none());
    }

    #[test]
    fn a_protocol_relative_link_becomes_https() {
        // The signed answer this build received for an AnimeLib episode
        // carries protocol-relative links on this host, not `https://` ones.
        let url = "//cloud2.solodcdn.com/useruploads/351182fc-e1ac-4521-a9e3-261303e69687/43c594ef04d92a48f/360.mp4:hls:manifest.m3u8";
        let expected = "https://cloud2.solodcdn.com/useruploads/351182fc-e1ac-4521-a9e3-261303e69687/43c594ef04d92a48f/360.mp4:hls:manifest.m3u8";
        for shift in 0..=ALPHABET {
            let encoded = encode_link(url, shift);
            assert_eq!(
                decode_link(&encoded).as_deref(),
                Some(expected),
                "shift {shift}"
            );
        }
        assert_eq!(
            decode_link("//cloud2.solodcdn.com/stream.m3u8").as_deref(),
            Some("https://cloud2.solodcdn.com/stream.m3u8")
        );
    }

    #[test]
    fn links_are_sorted_by_quality_and_labelled() {
        let body = format!(
            r#"{{"links":{{
                "360":[{{"src":"{}","type":"video/mp4"}}],
                "720":[{{"src":"{}","type":"application/x-mpegURL"}}],
                "1080":[{{"src":"{}","type":"application/x-mpegURL"}}]
            }}}}"#,
            encode_link("https://cdn.example/360.mp4", 7),
            encode_link("https://cdn.example/720.mp4", 7),
            encode_link("https://cdn.example/1080.mp4", 7)
        );
        let streams = parse_links(&body).expect("links parse");
        assert_eq!(
            streams
                .iter()
                .map(|s| s.quality.as_str())
                .collect::<Vec<_>>(),
            vec!["1080", "720", "360"]
        );
        assert_eq!(streams[0].container(), "m3u8");
        assert_eq!(streams[2].container(), "mp4");
        assert_eq!(streams[2].url, "https://cdn.example/360.mp4");
    }

    #[test]
    fn a_manifest_url_wins_over_the_reported_type() {
        let stream = KodikStream {
            quality: "720".to_string(),
            url: "https://cdn.example/720.mp4:hls:manifest.m3u8".to_string(),
            media_type: "video/mp4".to_string(),
        };
        assert_eq!(stream.container(), "m3u8");
    }

    #[test]
    fn an_empty_links_map_is_not_a_resolution() {
        assert!(parse_links(r#"{"links":{}}"#).is_none());
        assert!(parse_links(r#"{"links":{"720":[]}}"#).is_none());
    }

    #[test]
    fn a_region_block_page_reports_kodiks_own_words() {
        let page = "<div class=\"promo-error-box\"><div class=\"message\">Видео запрещено к просмотру в данной стране</div></div>";
        let message = refusal_message(page).expect("refusal");
        assert!(message.contains("Видео запрещено к просмотру в данной стране"));
    }

    #[test]
    fn the_comment_on_every_player_page_is_not_a_refusal() {
        // Every player page carries this comment; treating it as a refusal
        // made every stream fail with a false "partner access" error.
        let page = "<!-- Чтобы получить доступ к базе фильмов с данным плеером, пишите на почту: support@kodikres.com --><!doctype html><html><script>var urlParams = '{}';</script></html>";
        assert!(refusal_message(page).is_none());
        assert!(refusal_message(PAGE).is_none());
    }

    #[test]
    fn the_script_error_template_is_not_a_refusal() {
        // The player appends this box at runtime when the embedding frame is
        // wrong; it is in the JS of every page and says nothing about this one.
        let page = r#"<html><script>$("body").append('<div class="promo-error"><div class="message">Извините, но данной страницы не существует</div></div>');</script><script>var urlParams = '{}';</script></html>"#;
        assert!(refusal_message(page).is_none());
    }

    #[test]
    fn html_errors_are_reported_as_text() {
        let page = "<html><body><div class=\"promo-error-box\"><div class=\"message\">Error code 404</div><p>Not found</p></div></body></html>";
        let text = plain_text(page);
        assert!(text.contains("Error code 404"));
        assert!(!text.contains('<'));
    }

    /// Live probe. Needs a machine in a region Kodik serves.
    /// `cargo test --lib stream::kodik -- --ignored --nocapture`
    #[tokio::test]
    #[ignore = "needs a region Kodik serves"]
    async fn live_kodik_resolves_a_real_player() {
        let source = "//kodikplayer.com/seria/1211977/d5a209e95d68094e346175d7357ef0c7/720p";
        match resolve(
            source,
            "https://animelib.org/",
            Vec::new(),
            "Kodik:32412",
            None,
        )
        .await
        {
            Ok(streams) => {
                println!("kodik resolved {} streams", streams.len());
                for stream in &streams {
                    println!(
                        "  {} {} {} {}",
                        stream.quality, stream.r#type, stream.label, stream.url
                    );
                }
                assert!(!streams.is_empty());
            }
            Err(error) => panic!("kodik did not resolve: {error}"),
        }
    }
}
