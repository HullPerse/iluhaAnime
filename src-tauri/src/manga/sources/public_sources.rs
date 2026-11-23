use super::*;
use reqwest::{header, Url};
use scraper::{Html, Selector};
use std::collections::HashSet;

const ASURA: &str = "https://api.asurascans.com/api/series";
const READ: &str = "https://readmanga.me";
const WAMANGA: &str = "https://wamanga.ru";
const WAMANGA_API: &str = "https://wamanga.ru/api/v1";
const WAMANGA_PAGE_SIZE: u32 = 10;
pub(in crate::manga) const ASURA_CDN: &str = "cdn.asurascans.com";
pub(in crate::manga) const READ_CDN: &str = "rm.one-way.work";
pub(in crate::manga) const WAMANGA_CDN: &str = "wamanga.ru";
static ASURA_CLIENT: OnceLock<Result<Arc<SourceClient>, SourceError>> = OnceLock::new();
static READ_CLIENT: OnceLock<Result<Arc<SourceClient>, SourceError>> = OnceLock::new();
static WAMANGA_CLIENT: OnceLock<Result<Arc<SourceClient>, SourceError>> = OnceLock::new();
const WEB_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";

pub(in crate::manga) fn client(
    source: MangaSource,
    proxy: Option<&str>,
) -> Result<Arc<SourceClient>, SourceError> {
    let cell = match source {
        MangaSource::AsuraScans => &ASURA_CLIENT,
        MangaSource::ReadManga => &READ_CLIENT,
        MangaSource::WaManga => &WAMANGA_CLIENT,
        _ => return Err(SourceError::Unsupported),
    };
    let interval = if source == MangaSource::WaManga {
        Duration::from_millis(250)
    } else {
        Duration::from_secs(1)
    };
    source_client(cell, source.id(), interval, proxy)
}

pub(in crate::manga) fn referer(source: MangaSource) -> &'static str {
    match source {
        MangaSource::AsuraScans => "https://asurascans.com/",
        MangaSource::WaManga => "https://wamanga.ru/",
        _ => "https://readmanga.me/",
    }
}

pub(in crate::manga) fn with_headers(request: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
    request.header(header::USER_AGENT, WEB_UA)
}

fn request(
    client: &SourceClient,
    source: MangaSource,
    url: impl reqwest::IntoUrl,
) -> reqwest::RequestBuilder {
    with_headers(client.client.get(url)).header(header::REFERER, referer(source))
}

fn slug(value: &str) -> Option<&str> {
    (!value.is_empty()
        && value.len() <= 160
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_')))
    .then_some(value)
}

fn picture(value: &Value, host: &str) -> Option<String> {
    let url = value.as_str().or_else(|| value["url"].as_str())?;
    allowed_cover(url, host)
}

fn split_people(value: &str) -> Vec<String> {
    value
        .split('/')
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(str::to_owned)
        .collect()
}

fn asura_hit(row: &Value) -> Option<MangaSearchHit> {
    let url = Url::parse(referer(MangaSource::AsuraScans))
        .ok()?
        .join(row["public_url"].as_str()?)
        .ok()?;
    if url.scheme() != "https" || url.host_str() != Some("asurascans.com") {
        return None;
    }
    let id = slug(url.path().strip_prefix("/comics/")?)?;
    Some(MangaSearchHit {
        id: id.to_owned(),
        title: non_empty(&row["title"])?,
        cover: picture(&row["cover"], ASURA_CDN),
        status: non_empty(&row["status"]),
        chapters: row["chapter_count"]
            .as_u64()
            .and_then(|count| u32::try_from(count).ok())
            .filter(|count| *count > 0),
        suggestive: false,
        rating: "safe".to_owned(),
        aliases: vec![],
        external_ids: ExternalIds::default(),
        web_url: None,
    })
}

fn read_hit(row: &Value) -> Option<MangaSearchHit> {
    Some(MangaSearchHit {
        id: slug(row["elementId"]["linkName"].as_str()?)?.to_owned(),
        title: non_empty(&row["name"])?,
        cover: picture(&row["picUrl"], READ_CDN),
        status: non_empty(&row["productionStatus"]),
        chapters: row["chaptersCount"]
            .as_u64()
            .and_then(|count| u32::try_from(count).ok())
            .filter(|count| *count > 0),
        suggestive: false,
        rating: "safe".to_owned(),
        aliases: vec![],
        external_ids: ExternalIds::default(),
        web_url: None,
    })
}

pub(super) async fn search(
    source: MangaSource,
    query: &str,
    page: u32,
    nsfw: bool,
    proxy: Option<&str>,
    person: Option<&MangaPersonSearch>,
) -> Result<MangaSearchPage, SourceError> {
    let client = client(source, proxy)?;
    if source == MangaSource::WaManga {
        let offset = (page - 1) * WAMANGA_PAGE_SIZE;
        let text = person.map_or(query, |person| person.name.as_str());
        let mut request = request(&client, source, format!("{WAMANGA_API}/manga"))
            .query(&[("limit", WAMANGA_PAGE_SIZE + 1), ("offset", offset)]);
        if !text.is_empty() {
            request = request.query(&[("query", text)]);
        }
        let body = client.get(request).await?;
        let rows = body.as_array().ok_or(SourceError::Parse)?;
        let items = rows
            .iter()
            .filter_map(|row| wamanga_hit(row, nsfw))
            .take(WAMANGA_PAGE_SIZE as usize)
            .collect();
        return Ok(MangaSearchPage {
            items,
            has_next: rows.len() > WAMANGA_PAGE_SIZE as usize,
        });
    }
    if source == MangaSource::AsuraScans {
        let mut request = request(&client, source, ASURA);
        request = if let Some(person) = person {
            request.query(&[(person.role.query_key(), person.name.as_str())])
        } else {
            request.query(&[("search", query)])
        };
        let body = client.get(request.query(&[("page", page)])).await?;
        let rows = body["data"].as_array().ok_or(SourceError::Parse)?;
        let size = body["meta"]["per_page"]
            .as_u64()
            .filter(|size| *size > 0)
            .ok_or(SourceError::Parse)?;
        let total = body["meta"]["total"].as_u64().ok_or(SourceError::Parse)?;
        return Ok(MangaSearchPage {
            items: rows.iter().filter_map(asura_hit).collect(),
            has_next: u64::from(page) * size < total,
        });
    }
    if let Some(person) = person {
        if let Some(result) = read_person_search(&client, person, page).await? {
            return Ok(result);
        }
    }
    let offset = (page - 1) * 10;
    let body = client
        .get(
            request(&client, source, format!("{READ}/api/catalog/search"))
                .query(&[("q", query), ("sortType", "RATING")])
                .query(&[("offset", offset)]),
        )
        .await?;
    let rows = body["list"].as_array().ok_or(SourceError::Parse)?;
    let total = body["total"].as_u64().ok_or(SourceError::Parse)?;
    Ok(MangaSearchPage {
        items: rows.iter().take(10).filter_map(read_hit).collect(),
        has_next: u64::from(offset + 10) < total,
    })
}

fn read_title_id(href: &str) -> Option<&str> {
    let path = href.strip_prefix('/')?;
    let path = path.split(['?', '#']).next()?;
    if path.is_empty() || path.contains('/') {
        return None;
    }
    slug(path)
}

fn page_number(href: &str) -> Option<u32> {
    href.split_once('?')
        .and_then(|(_, query)| query.split('&').find_map(|pair| pair.strip_prefix("page=")))
        .and_then(|page| page.parse().ok())
}

fn read_person_page(html: &str, page: u32) -> Result<MangaSearchPage, SourceError> {
    let document = Html::parse_document(html);
    let (Ok(tiles), Ok(title_link), Ok(images), Ok(pages)) = (
        Selector::parse(".tile.manga-mtr"),
        Selector::parse("h3 a[href]"),
        Selector::parse("img"),
        Selector::parse("a[href*='page=']"),
    ) else {
        return Err(SourceError::Parse);
    };
    let mut seen = HashSet::new();
    let items = document
        .select(&tiles)
        .filter_map(|tile| {
            let link = tile.select(&title_link).next()?;
            let id = read_title_id(link.value().attr("href")?)?;
            if !seen.insert(id.to_owned()) {
                return None;
            }
            let title = link
                .value()
                .attr("title")
                .map(str::trim)
                .filter(|title| !title.is_empty())
                .map(str::to_owned)
                .or_else(|| {
                    let title = link.text().collect::<String>();
                    let title = title.trim();
                    (!title.is_empty()).then(|| title.to_owned())
                })?;
            let cover = tile.select(&images).next().and_then(|image| {
                ["data-original", "src"]
                    .iter()
                    .find_map(|attribute| image.value().attr(attribute))
                    .and_then(|url| allowed_cover(url, READ_CDN))
            });
            Some(MangaSearchHit {
                id: id.to_owned(),
                title,
                cover,
                status: None,
                chapters: None,
                suggestive: false,
                rating: "safe".to_owned(),
                aliases: Vec::new(),
                external_ids: ExternalIds::default(),
                web_url: None,
            })
        })
        .collect();
    let has_next = document
        .select(&pages)
        .filter_map(|link| page_number(link.value().attr("href")?))
        .any(|next| next > page);
    Ok(MangaSearchPage { items, has_next })
}

fn read_person_slugs(name: &str) -> Vec<String> {
    if !name
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || character.is_ascii_whitespace())
    {
        return Vec::new();
    }
    let words: Vec<_> = name
        .split_whitespace()
        .map(str::to_ascii_lowercase)
        .filter(|word| !word.is_empty())
        .collect();
    if words.len() < 2 {
        return Vec::new();
    }
    let joined = |words: &[String]| words.join("_");
    let mut candidates = Vec::new();
    let reversed = words.iter().rev().cloned().collect::<Vec<_>>();
    candidates.push(joined(&reversed));
    let original = joined(&words);
    if original != candidates[0] {
        candidates.push(original);
    }
    candidates
}

async fn read_person_search(
    client: &SourceClient,
    person: &MangaPersonSearch,
    page: u32,
) -> Result<Option<MangaSearchPage>, SourceError> {
    let mut candidates = Vec::new();
    if let Some(key) = person
        .key
        .as_deref()
        .filter(|key| person.source == Some(MangaSource::ReadManga) && slug(key).is_some())
    {
        candidates.push(key.to_owned());
    } else {
        candidates.extend(read_person_slugs(&person.name));
    }
    for candidate in candidates {
        let response = client
            .bytes(request(
                client,
                MangaSource::ReadManga,
                format!("{READ}/list/person/{candidate}"),
            ))
            .await;
        match response {
            Ok(html) => {
                return read_person_page(
                    std::str::from_utf8(&html).map_err(|_| SourceError::Parse)?,
                    page,
                )
                .map(Some);
            }
            Err(SourceError::NotFound) => {}
            Err(error) => return Err(error),
        }
    }
    Ok(None)
}

fn chapter(number: String, id: String, language: String) -> MangaChapter {
    MangaChapter {
        id,
        key: chapter_key(&number),
        number,
        volume: None,
        title: None,
        language,
        group: None,
        locked: false,
        lock_reason: None,
        available_at: None,
        branch: None,
    }
}

fn asura_chapter(row: &Value) -> Option<MangaChapter> {
    let number = row["number"].as_number()?.to_string();
    let mut result = chapter(number.clone(), format!("chapter-{number}"), "en".to_owned());
    result.title = non_empty(&row["title"]);
    result.locked = row["is_premium"].as_bool()?;
    result.lock_reason = result.locked.then(|| "paid".to_owned());
    result.available_at = non_empty(&row["early_access_until"]);
    Some(result)
}

fn read_chapter(path: &str, id: &str) -> Option<MangaChapter> {
    let tail = path
        .strip_prefix('/')?
        .strip_prefix(id)?
        .strip_prefix("/vol")?;
    let (volume, number) = tail.split_once('/')?;
    if !volume.bytes().all(|b| b.is_ascii_digit())
        || volume.is_empty()
        || volume.len() > 8
        || !chapter_number(number)
    {
        return None;
    }
    let mut result = chapter(
        number.to_owned(),
        format!("vol{volume}-{number}"),
        "ru".to_owned(),
    );
    result.volume = Some(volume.to_owned());
    Some(result)
}

fn chapter_number(number: &str) -> bool {
    let digits = |s: &str| !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit());
    number.len() <= 24
        && number
            .split_once('.')
            .map_or_else(|| digits(number), |(a, b)| digits(a) && digits(b))
}

fn metadata(document: &Html, selector: &str, attribute: &str) -> Option<String> {
    let selector = Selector::parse(selector).ok()?;
    let item = document.select(&selector).next()?;
    let text = if attribute.is_empty() {
        item.text().collect::<String>()
    } else {
        item.value().attr(attribute)?.to_owned()
    };
    let text = text.trim();
    (!text.is_empty()).then(|| text.to_owned())
}

#[derive(Default)]
struct ReadPeople {
    authors: Vec<String>,
    artists: Vec<String>,
    author_keys: Vec<String>,
    artist_keys: Vec<String>,
}

fn read_person_key(href: &str) -> Option<String> {
    let path = href.strip_prefix("/list/person/")?;
    let path = path.split(['?', '#']).next()?;
    slug(path).map(str::to_owned)
}

fn read_people(document: &Html) -> ReadPeople {
    let (Ok(people), Ok(roles), Ok(names), Ok(links)) = (
        Selector::parse(".cr-main-person-item"),
        Selector::parse(".cr-main-person-item__role"),
        Selector::parse(".cr-main-person-item__name a, .cr-main-person-item__name"),
        Selector::parse("a[href^='/list/person/']"),
    ) else {
        return ReadPeople::default();
    };
    let mut result = ReadPeople::default();
    let mut seen_authors = HashSet::new();
    let mut seen_artists = HashSet::new();
    for person in document.select(&people) {
        let role = person
            .select(&roles)
            .next()
            .map(|role| role.text().collect::<String>().to_lowercase())
            .unwrap_or_default();
        let (target, keys, seen) = if role.contains("автор") || role.contains("сценар") {
            (
                &mut result.authors,
                &mut result.author_keys,
                &mut seen_authors,
            )
        } else if role.contains("худож") || role.contains("иллюст") {
            (
                &mut result.artists,
                &mut result.artist_keys,
                &mut seen_artists,
            )
        } else {
            continue;
        };
        let Some(name) = person.select(&names).next() else {
            continue;
        };
        let name = name.text().collect::<String>();
        let name = name.trim();
        if name.is_empty() || !seen.insert(name.to_owned()) {
            continue;
        }
        let key = person
            .select(&links)
            .next()
            .and_then(|link| link.value().attr("href"))
            .and_then(read_person_key)
            .unwrap_or_default();
        target.push(name.to_owned());
        keys.push(key);
    }
    result
}

fn read_details(html: &str, id: &str, nsfw: bool) -> Result<MangaDetails, SourceError> {
    let document = Html::parse_document(html);
    let mature = metadata(&document, "a[href*='ageConfirm'], .mtr-message", "").is_some();
    if mature && !nsfw {
        return Err(SourceError::Blocked);
    }
    let mut seen = HashSet::new();
    let selector = Selector::parse("a[href]").map_err(|_| SourceError::Parse)?;
    let mut chapters: Vec<_> = document
        .select(&selector)
        .filter_map(|a| read_chapter(a.value().attr("href")?, id))
        .filter(|row| seen.insert(row.id.clone()))
        .collect();
    chapters.sort_by(|a, b| {
        b.number
            .parse::<f64>()
            .unwrap_or_default()
            .total_cmp(&a.number.parse::<f64>().unwrap_or_default())
    });
    let title = MangaSearchHit {
        id: id.to_owned(),
        title: metadata(&document, "h1.cr-hero-names__main", "").ok_or(SourceError::Parse)?,
        status: None,
        chapters: None,
        cover: metadata(
            &document,
            "meta[itemprop=image], meta[property='og:image']",
            "content",
        )
        .and_then(|url| allowed_cover(&url, READ_CDN)),
        suggestive: mature,
        rating: if mature { "pornographic" } else { "safe" }.to_owned(),
        aliases: vec![],
        external_ids: ExternalIds::default(),
        web_url: None,
    };
    let people = read_people(&document);
    Ok(MangaDetails {
        title,
        description: metadata(
            &document,
            "meta[itemprop=description],meta[name=description]",
            "content",
        ),
        authors: people.authors,
        artists: people.artists,
        author_keys: people.author_keys,
        artist_keys: people.artist_keys,
        genres: vec![],
        publication_status: None,
        notification: None,
        release: None,
        chapters,
    })
}

fn wamanga_absolute(path: &str) -> Option<String> {
    let url = Url::parse(WAMANGA).ok()?.join(path).ok()?;
    allowed_cover(url.as_str(), WAMANGA_CDN)
}

fn wamanga_cover(row: &Value) -> Option<String> {
    ["coverUrl", "imageUrl"]
        .iter()
        .find_map(|key| row[*key].as_str().and_then(wamanga_absolute))
}

fn wamanga_web_url(row: &Value) -> Option<String> {
    let kind = row["type"]
        .as_str()
        .filter(|kind| matches!(*kind, "manga" | "manhwa" | "manhua"))?;
    let slug = slug(row["slug"].as_str()?)?;
    allowed_cover(&format!("{WAMANGA}/{kind}/{slug}"), WAMANGA_CDN)
}

fn wamanga_people(row: &Value, key: &str) -> Vec<String> {
    row[key]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .collect()
}

fn wamanga_hit(row: &Value, nsfw: bool) -> Option<MangaSearchHit> {
    if row["hidden"].as_bool() == Some(true) {
        return None;
    }
    let adult = row["isAdult"].as_bool().unwrap_or(false);
    if adult && !nsfw {
        return None;
    }
    let id = slug(row["id"].as_str()?)?;
    let title = non_empty(&row["title"])?;
    let pegi = row["pegiRating"].as_str().unwrap_or_default();
    let mut aliases = Vec::new();
    if let Some(value) = non_empty(&row["titleEnglish"]) {
        aliases.push(value);
    }
    if let Some(rows) = row["alternateTitles"].as_array() {
        for value in rows.iter().filter_map(Value::as_str) {
            let value = value.trim();
            if !value.is_empty() && !aliases.iter().any(|alias| alias == value) {
                aliases.push(value.to_owned());
            }
        }
    }
    aliases.truncate(50);
    let rating = if adult {
        "pornographic"
    } else if pegi == "18+" {
        "suggestive"
    } else {
        "safe"
    };
    Some(MangaSearchHit {
        id: id.to_owned(),
        title,
        cover: wamanga_cover(row),
        status: non_empty(&row["statusTitle"]),
        chapters: None,
        suggestive: adult || pegi == "18+",
        rating: rating.to_owned(),
        aliases,
        external_ids: ExternalIds::default(),
        web_url: wamanga_web_url(row),
    })
}

fn wamanga_chapter(row: &Value, group: Option<&str>) -> Option<MangaChapter> {
    if row["isProcessing"].as_bool() == Some(true) {
        return None;
    }
    let expected = row["totalFilesExpected"].as_u64().unwrap_or_default();
    let processed = row["processedFilesCount"].as_u64().unwrap_or_default();
    if expected > 0 && processed < expected {
        return None;
    }
    let id = slug(row["id"].as_str()?)?;
    let position = row["position"]
        .as_f64()
        .or_else(|| row["position"].as_str()?.parse::<f64>().ok())?;
    if !position.is_finite() || position < 0.0 {
        return None;
    }
    let mut result = chapter(position.to_string(), id.to_owned(), "ru".to_owned());
    result.title = non_empty(&row["title"]);
    result.group = group.map(str::to_owned);
    Some(result)
}

fn wamanga_chapter_total(rows: &[Value]) -> Option<u32> {
    u32::try_from(
        rows.iter()
            .filter_map(|row| wamanga_chapter(row, None))
            .count(),
    )
    .ok()
    .filter(|count| *count > 0)
}

pub(super) async fn wamanga_chapter_count(id: &str, proxy: Option<&str>) -> Option<u32> {
    let id = slug(id)?;
    let client = client(MangaSource::WaManga, proxy).ok()?;
    let body = client
        .get(request(
            &client,
            MangaSource::WaManga,
            format!("{WAMANGA_API}/manga/{id}/chapters"),
        ))
        .await
        .ok()?;
    wamanga_chapter_total(body.as_array()?)
}

fn wamanga_page_url(path: &str) -> Option<Url> {
    let url = Url::parse(WAMANGA).ok()?.join(path).ok()?;
    allowed_cover(url.as_str(), WAMANGA_CDN)?;
    Some(url)
}

async fn wamanga_pages(chapter_id: &str, proxy: Option<&str>) -> Result<Vec<Url>, SourceError> {
    let chapter_id = slug(chapter_id).ok_or(SourceError::Unsupported)?;
    let client = client(MangaSource::WaManga, proxy)?;
    let body = client
        .get(request(
            &client,
            MangaSource::WaManga,
            format!("{WAMANGA_API}/chapters/{chapter_id}"),
        ))
        .await?;
    body["files"]
        .as_array()
        .ok_or(SourceError::Parse)?
        .iter()
        .map(|file| {
            let path = file["diskFile"].as_str().ok_or(SourceError::Parse)?;
            wamanga_page_url(path).ok_or(SourceError::Parse)
        })
        .collect()
}

async fn wamanga_details(
    id: &str,
    nsfw: bool,
    proxy: Option<&str>,
) -> Result<MangaDetails, SourceError> {
    let id = slug(id).ok_or(SourceError::Unsupported)?;
    let client = client(MangaSource::WaManga, proxy)?;
    let body = client
        .get(request(
            &client,
            MangaSource::WaManga,
            format!("{WAMANGA_API}/manga/{id}"),
        ))
        .await?;
    if body["isAdult"].as_bool() == Some(true) && !nsfw {
        return Err(SourceError::Blocked);
    }
    let mut title = wamanga_hit(&body, nsfw).ok_or(SourceError::NotFound)?;
    let feed = client
        .get(request(
            &client,
            MangaSource::WaManga,
            format!("{WAMANGA_API}/manga/{id}/chapters"),
        ))
        .await?;
    let rows = feed.as_array().ok_or(SourceError::Parse)?;
    let group = body["teams"]
        .as_array()
        .and_then(|teams| teams.iter().find_map(|team| non_empty(&team["name"])));
    let mut chapters: Vec<_> = rows
        .iter()
        .filter_map(|row| wamanga_chapter(row, group.as_deref()))
        .collect();
    chapters.sort_by(|a, b| {
        b.number
            .parse::<f64>()
            .unwrap_or_default()
            .total_cmp(&a.number.parse::<f64>().unwrap_or_default())
    });
    title.chapters = wamanga_chapter_total(rows);
    Ok(MangaDetails {
        title,
        description: non_empty(&body["description"]),
        authors: wamanga_people(&body, "authors"),
        artists: wamanga_people(&body, "artists"),
        author_keys: Vec::new(),
        artist_keys: Vec::new(),
        genres: wamanga_people(&body, "genres"),
        release: body["year"].as_u64().map(|year| year.to_string()),
        publication_status: non_empty(&body["statusTitle"]),
        notification: None,
        chapters,
    })
}

pub(super) async fn details(
    source: MangaSource,
    id: &str,
    nsfw: bool,
    proxy: Option<&str>,
) -> Result<MangaDetails, SourceError> {
    let id = slug(id).ok_or(SourceError::Unsupported)?;
    if source == MangaSource::WaManga {
        return wamanga_details(id, nsfw, proxy).await;
    }
    let client = client(source, proxy)?;
    if source == MangaSource::ReadManga {
        let html = client
            .bytes(request(&client, source, format!("{READ}/{id}")))
            .await?;
        return read_details(
            std::str::from_utf8(&html).map_err(|_| SourceError::Parse)?,
            id,
            nsfw,
        );
    }
    let body = client
        .get(request(&client, source, format!("{ASURA}/{id}")))
        .await?;
    let row = &body["series"];
    let feed = client
        .get(request(&client, source, format!("{ASURA}/{id}/chapters")))
        .await?;
    Ok(MangaDetails {
        title: asura_hit(row).ok_or(SourceError::Parse)?,
        description: non_empty(&row["description"]),
        authors: non_empty(&row["author"])
            .map(|value| split_people(&value))
            .unwrap_or_default(),
        artists: non_empty(&row["artist"])
            .map(|value| split_people(&value))
            .unwrap_or_default(),
        author_keys: Vec::new(),
        artist_keys: Vec::new(),
        genres: row["genres"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|g| non_empty(&g["name"]))
            .collect(),
        publication_status: non_empty(&row["status"]),
        notification: None,
        release: None,
        chapters: feed["data"]
            .as_array()
            .ok_or(SourceError::Parse)?
            .iter()
            .filter_map(asura_chapter)
            .collect(),
    })
}

fn read_pages(html: &str) -> Result<Vec<Url>, SourceError> {
    let data = html
        .split_once("rm_h.readerInit(chapterInfo, [[")
        .ok_or(SourceError::Blocked)?
        .1
        .split_once("]]")
        .ok_or(SourceError::Parse)?
        .0;
    data.split("],[")
        .map(|row| {
            let path = row
                .split('"')
                .nth(1)
                .ok_or(SourceError::Parse)?
                .split('?')
                .next()
                .ok_or(SourceError::Parse)?;
            if !row.starts_with("'https://rm.one-way.work/','',") || !path.starts_with("auto/") {
                return Err(SourceError::Parse);
            }
            Url::parse(&format!("https://{READ_CDN}/{path}")).map_err(|_| SourceError::Parse)
        })
        .collect()
}

pub(in crate::manga) async fn pages(
    source: MangaSource,
    id: &str,
    chapter_id: &str,
    proxy: Option<&str>,
) -> Result<Vec<Url>, SourceError> {
    let id = slug(id).ok_or(SourceError::Unsupported)?;
    if source == MangaSource::WaManga {
        return wamanga_pages(chapter_id, proxy).await;
    }
    let client = client(source, proxy)?;
    if source == MangaSource::ReadManga {
        let (volume, number) = chapter_id.split_once('-').ok_or(SourceError::Unsupported)?;
        let path = format!("/{id}/{volume}/{number}");
        read_chapter(&path, id).ok_or(SourceError::Unsupported)?;
        let html = client
            .bytes(request(&client, source, format!("{READ}{path}")))
            .await?;
        return read_pages(std::str::from_utf8(&html).map_err(|_| SourceError::Parse)?);
    }
    let number = chapter_id
        .strip_prefix("chapter-")
        .filter(|n| chapter_number(n))
        .ok_or(SourceError::Unsupported)?;
    let body = client
        .get(request(
            &client,
            source,
            format!("{ASURA}/{id}/chapters/{number}"),
        ))
        .await?;
    let data = &body["data"];
    if data["is_locked"].as_bool() != Some(false) {
        return Err(SourceError::PaidChapter);
    }
    data["chapter"]["pages"]
        .as_array()
        .ok_or(SourceError::Parse)?
        .iter()
        .map(|page| {
            let url = picture(page, ASURA_CDN).ok_or(SourceError::Parse)?;
            Url::parse(&url).map_err(|_| SourceError::Parse)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn read_people_reads_author_and_artist_roles() {
        let document = Html::parse_document(
            r#"
            <div class="cr-main-person-item">
              <span class="cr-main-person-item__role">Автор</span>
              <span class="cr-main-person-item__name"><a href="/list/person/adzuma_kiohiko">Киёхико Адзума</a></span>
            </div>
            <div class="cr-main-person-item">
              <span class="cr-main-person-item__role">Художник</span>
              <span class="cr-main-person-item__name"><a href="/list/person/adzuma_kiohiko">Киёхико Адзума</a></span>
            </div>
            "#,
        );
        let people = read_people(&document);
        assert_eq!(people.authors, vec!["Киёхико Адзума".to_owned()]);
        assert_eq!(people.artists, vec!["Киёхико Адзума".to_owned()]);
        assert_eq!(people.author_keys, vec!["adzuma_kiohiko".to_owned()]);
        assert_eq!(people.artist_keys, vec!["adzuma_kiohiko".to_owned()]);
    }

    #[test]
    fn read_person_page_reads_tiles_and_pagination() {
        let page = read_person_page(
            r#"
            <div class="tile col-sm-6 manga-mtr">
              <div class="img"><a href="/one-piece"><img data-original="https://rm.one-way.work/uploads/one-piece.webp"></a></div>
              <div class="desc"><h3><a href="/one-piece" title="One Piece">One Piece</a></h3></div>
            </div>
            <div class="tile col-sm-6 manga-mtr">
              <div class="img"><a href="/wanted"><img data-original="https://rm.one-way.work/uploads/wanted.webp"></a></div>
              <div class="desc"><h3><a href="/wanted">Wanted</a></h3></div>
            </div>
            <a href="/list/person/oda_eiichiro?page=2">2</a>
            "#,
            1,
        )
        .expect("person page");
        assert_eq!(page.items.len(), 2);
        assert_eq!(page.items[0].id, "one-piece");
        assert_eq!(page.items[0].title, "One Piece");
        assert_eq!(
            page.items[0].cover.as_deref(),
            Some("https://rm.one-way.work/uploads/one-piece.webp")
        );
        assert!(page.has_next);
    }

    #[test]
    fn search_hits_include_source_status_and_chapter_count() {
        let asura = asura_hit(&serde_json::json!({
            "title": "Damn Reincarnation",
            "status": "ongoing",
            "chapter_count": 102,
            "public_url": "/comics/damn-reincarnation-7ba78ec7",
            "cover": "https://cdn.asurascans.com/asura-images/covers/damn-reincarnation.webp"
        }))
        .expect("Asura hit");
        assert_eq!(asura.status.as_deref(), Some("ongoing"));
        assert_eq!(asura.chapters, Some(102));

        let read = read_hit(&serde_json::json!({
            "elementId": { "linkName": "van_pis__A5664" },
            "name": "Ван Пис",
            "productionStatus": "PROGRESS",
            "chaptersCount": 1216
        }))
        .expect("ReadManga hit");
        assert_eq!(read.status.as_deref(), Some("PROGRESS"));
        assert_eq!(read.chapters, Some(1216));
    }

    #[test]
    fn split_people_separates_asura_coauthors() {
        assert_eq!(
            split_people("Park Jungyeol/ wooden horse"),
            vec!["Park Jungyeol".to_owned(), "wooden horse".to_owned()]
        );
        assert_eq!(split_people("Solo"), vec!["Solo".to_owned()]);
    }

    #[test]
    fn read_person_slugs_handles_western_names() {
        assert_eq!(
            read_person_slugs("Eiichiro Oda"),
            vec!["oda_eiichiro".to_owned(), "eiichiro_oda".to_owned()]
        );
        assert!(read_person_slugs("Ода Эйитиро").is_empty());
    }

    #[test]
    fn wamanga_catalog_hit_uses_uuid_public_url_and_relative_cover() {
        let row = serde_json::json!({
            "id": "99b7b6e4-7c7e-4a93-92d1-2ead150bda47",
            "slug": "vetrolom",
            "type": "manga",
            "title": "Ветролом",
            "titleEnglish": "Wind Breaker",
            "alternateTitles": ["ウインドブレイカ", "Wind Breaker"],
            "coverUrl": "/app/uploads/cover.webp",
            "statusTitle": "ongoing",
            "isAdult": false,
            "hidden": false,
            "pegiRating": "16+"
        });
        let hit = wamanga_hit(&row, false).expect("WaManga hit");
        assert_eq!(hit.id, "99b7b6e4-7c7e-4a93-92d1-2ead150bda47");
        assert_eq!(
            hit.web_url.as_deref(),
            Some("https://wamanga.ru/manga/vetrolom")
        );
        assert_eq!(
            hit.cover.as_deref(),
            Some("https://wamanga.ru/app/uploads/cover.webp")
        );
        assert_eq!(hit.rating, "safe");
        assert!(!hit.suggestive);
        assert_eq!(hit.aliases, vec!["Wind Breaker", "ウインドブレイカ"]);

        let adult = serde_json::json!({
            "id": "0a580438-bc72-4503-940b-12a5da881b56",
            "slug": "adult",
            "type": "manhwa",
            "title": "Adult",
            "isAdult": true
        });
        assert!(wamanga_hit(&adult, false).is_none());
        assert!(wamanga_hit(&adult, true).is_some());
    }

    #[test]
    fn wamanga_chapters_keep_fractional_numbers_and_skip_incomplete_files() {
        let row = serde_json::json!({
            "id": "79319247-a3fb-43a3-95b2-cf2ab98be2a3",
            "position": 100.5,
            "title": "",
            "isProcessing": false,
            "totalFilesExpected": 19,
            "processedFilesCount": 19
        });
        let chapter = wamanga_chapter(&row, Some("Wa")).expect("WaManga chapter");
        assert_eq!(chapter.number, "100.5");
        assert_eq!(chapter.key, "100.5");
        assert_eq!(chapter.title, None);
        assert_eq!(chapter.group.as_deref(), Some("Wa"));
        assert!(chapter.available_at.is_none());

        let partial = serde_json::json!({
            "id": "d4116a3b-7519-4e6a-8e33-3f5fd5c4337f",
            "position": 1,
            "isProcessing": false,
            "totalFilesExpected": 10,
            "processedFilesCount": 2
        });
        assert!(wamanga_chapter(&partial, None).is_none());
    }

    #[test]
    fn wamanga_chapter_total_ignores_unavailable_chapters() {
        let rows = vec![
            serde_json::json!({
                "id": "79319247-a3fb-43a3-95b2-cf2ab98be2a3",
                "position": 2,
                "isProcessing": false,
                "totalFilesExpected": 4,
                "processedFilesCount": 4
            }),
            serde_json::json!({
                "id": "d4116a3b-7519-4e6a-8e33-3f5fd5c4337f",
                "position": 1,
                "isProcessing": false,
                "totalFilesExpected": 10,
                "processedFilesCount": 2
            }),
        ];

        assert_eq!(wamanga_chapter_total(&rows), Some(1));
        assert_eq!(wamanga_chapter_total(&[]), None);
    }

    #[test]
    fn wamanga_page_urls_stay_on_the_source_host() {
        assert!(wamanga_page_url("/app/uploads/page.webp").is_some());
        assert!(wamanga_page_url("https://wamanga.ru.invalid/page.webp").is_none());
        assert!(wamanga_page_url("https://example.com/page.webp").is_none());
        assert!(wamanga_page_url("//example.com/page.webp").is_none());
    }
}
