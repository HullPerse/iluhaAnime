use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::AppHandle;
use unicode_normalization::UnicodeNormalization;

use crate::anilist::auth::optional_token;
use crate::anilist::client::graphql_request;
use crate::app_db::cards::{
    get_card_gallery, get_meta, owns_card, set_card_preferred_image, upsert_card_gallery,
    CardGalleryRow, CardMetaRow, LOCAL_USER_ID,
};
use crate::app_db::db::{
    lock_app_data_write_timeout, now_seconds, open_database, APP_DATA_WRITE_TIMEOUT,
};
use crate::cards::types::CardKind;
use crate::scrapers::clients::resolve_proxy;
use crate::tenrai;

const GALLERY_TTL_SECONDS: i64 = 7 * 24 * 60 * 60;
const EMPTY_GALLERY_TTL_SECONDS: i64 = 60 * 60;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CardGalleryImage {
    pub url: String,
    pub thumb_url: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CardGallery {
    pub images: Vec<CardGalleryImage>,
    pub preferred_url: Option<String>,
}

fn supported(kind: CardKind) -> bool {
    matches!(
        kind,
        CardKind::Anime | CardKind::Manga | CardKind::Character
    )
}

fn parse_images(json: &str) -> Vec<CardGalleryImage> {
    serde_json::from_str(json).unwrap_or_default()
}

fn gallery_is_fresh(row: &CardGalleryRow, now: i64) -> bool {
    let images = parse_images(&row.images_json);
    let ttl = if images.is_empty() {
        EMPTY_GALLERY_TTL_SECONDS
    } else {
        GALLERY_TTL_SECONDS
    };
    row.fetched_at >= now.saturating_sub(ttl)
}

fn normalize_name(value: &str) -> String {
    let cleaned: String = value
        .nfkd()
        .map(|character| {
            if character.is_alphanumeric() {
                character
            } else {
                ' '
            }
        })
        .collect();
    let mut tokens: Vec<String> = cleaned.split_whitespace().map(str::to_lowercase).collect();
    tokens.sort();
    tokens.concat()
}

/// MAL stores character names as `Last, First` while AniList uses `First Last`.
/// Comparing normalized tokens handles both orders and the punctuation that
/// differs between the two catalogues.
pub fn match_character<'a>(
    name: &str,
    characters: &'a [tenrai::TenraiCharacter],
) -> Option<&'a tenrai::TenraiCharacter> {
    let target = normalize_name(name);
    if target.is_empty() {
        return None;
    }
    if let Some(exact) = characters
        .iter()
        .find(|character| normalize_name(&character.name) == target)
    {
        return Some(exact);
    }
    characters
        .iter()
        .map(|character| (character, normalize_name(&character.name)))
        .filter(|(_, normalized)| {
            normalized.len() >= 4 && (normalized.contains(&target) || target.contains(normalized))
        })
        .min_by_key(|(_, normalized)| normalized.len().abs_diff(target.len()))
        .map(|(character, _)| character)
}

fn media_type(kind: CardKind) -> Result<&'static str, String> {
    match kind {
        CardKind::Anime => Ok("ANIME"),
        CardKind::Manga => Ok("MANGA"),
        _ => Err("Tenrai galleries are only available for anime, manga and characters".into()),
    }
}

async fn resolve_media_mal_id(
    app: &AppHandle,
    kind: CardKind,
    entity_id: i64,
    proxy: Option<&str>,
) -> Result<i64, String> {
    let token = optional_token(app);
    let response = graphql_request(
        json!({
            "query": format!(
                "query ($id: Int) {{ Media(id: $id, type: {}) {{ idMal }} }}",
                media_type(kind)?
            ),
            "variables": { "id": entity_id },
        }),
        token.as_deref(),
        proxy,
    )
    .await?;
    response["data"]["Media"]["idMal"]
        .as_i64()
        .filter(|id| *id > 0)
        .ok_or_else(|| "AniList has no MAL id for this card".into())
}

async fn resolve_character_mal_id(
    app: &AppHandle,
    meta: &CardMetaRow,
    proxy: Option<&str>,
) -> Result<(i64, i64), String> {
    let (media_kind, media_id) = if let Some(id) = meta.collection_anime_id {
        (CardKind::Anime, id)
    } else if let Some(id) = meta.collection_manga_id {
        (CardKind::Manga, id)
    } else {
        return Err("this character has no linked anime or manga".into());
    };
    let media_mal_id = resolve_media_mal_id(app, media_kind, media_id, proxy).await?;
    let characters = tenrai::characters_for_media(media_kind.as_str(), media_mal_id, proxy).await?;
    let matched = match_character(&meta.title, &characters)
        .ok_or_else(|| "MAL character was not found in its source media".to_string())?;
    Ok((matched.mal_id, media_mal_id))
}

async fn fetch_gallery(
    app: &AppHandle,
    kind: CardKind,
    entity_id: i64,
    proxy: Option<&str>,
) -> Result<CardGallery, String> {
    if !supported(kind) {
        return Err("art switching is not available for this card kind".into());
    }
    let connection = open_database(app)?;
    if !owns_card(&connection, LOCAL_USER_ID, kind, entity_id)? {
        return Err("card is not in the collection".into());
    }
    let meta = get_meta(&connection, kind, entity_id)?
        .ok_or_else(|| "card metadata is missing".to_string())?;
    let cached = get_card_gallery(&connection, kind, entity_id)?;
    drop(connection);

    let now = now_seconds();
    if let Some(row) = &cached {
        if gallery_is_fresh(row, now) {
            return Ok(CardGallery {
                images: parse_images(&row.images_json),
                preferred_url: meta.preferred_image_url.clone(),
            });
        }
    }

    let mut mal_id = cached.as_ref().and_then(|row| row.mal_id);
    let mut media_mal_id = cached.as_ref().and_then(|row| row.media_mal_id);
    let fetched = async {
        if kind == CardKind::Character {
            if mal_id.is_none() || media_mal_id.is_none() {
                let (character_id, media_id) = resolve_character_mal_id(app, &meta, proxy).await?;
                mal_id = Some(character_id);
                media_mal_id = Some(media_id);
            }
        } else if mal_id.is_none() {
            mal_id = Some(resolve_media_mal_id(app, kind, entity_id, proxy).await?);
        }
        let id = mal_id.ok_or_else(|| "MAL id is missing".to_string())?;
        let pictures = tenrai::pictures(kind.as_str(), id, proxy).await?;
        Ok::<Vec<tenrai::TenraiPicture>, String>(pictures)
    }
    .await;

    let pictures = match fetched {
        Ok(pictures) => pictures,
        Err(error) => {
            if let Some(row) = cached {
                let images = parse_images(&row.images_json);
                if !images.is_empty() {
                    tracing::warn!(
                        error = error.as_str(),
                        "returning stale card gallery after Tenrai failure"
                    );
                    return Ok(CardGallery {
                        images,
                        preferred_url: meta.preferred_image_url,
                    });
                }
            }
            return Err(error);
        }
    };

    let images: Vec<CardGalleryImage> = pictures
        .into_iter()
        .map(|picture| CardGalleryImage {
            url: picture.url,
            thumb_url: picture.thumb_url,
        })
        .collect();
    let row = CardGalleryRow {
        kind,
        entity_id,
        mal_id,
        media_mal_id,
        images_json: serde_json::to_string(&images).unwrap_or_else(|_| "[]".to_string()),
        fetched_at: now,
    };
    let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
    let connection = open_database(app)?;
    upsert_card_gallery(&connection, &row)?;

    Ok(CardGallery {
        images,
        preferred_url: meta.preferred_image_url,
    })
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn cards_gallery(
    app: AppHandle,
    kind: String,
    entity_id: i64,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<CardGallery, String> {
    let kind = CardKind::from_db(kind.trim()).ok_or("unknown card kind")?;
    if entity_id <= 0 {
        return Err("invalid card entity id".into());
    }
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    fetch_gallery(&app, kind, entity_id, proxy.as_deref()).await
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn cards_set_preferred_image(
    app: AppHandle,
    kind: String,
    entity_id: i64,
    image_url: Option<String>,
) -> Result<usize, String> {
    let kind = CardKind::from_db(kind.trim()).ok_or("unknown card kind")?;
    if entity_id <= 0 {
        return Err("invalid card entity id".into());
    }
    if !supported(kind) {
        return Err("art switching is not available for this card kind".into());
    }
    let image_url = image_url
        .map(|url| url.trim().to_string())
        .filter(|url| !url.is_empty());
    let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
    let connection = open_database(&app)?;
    if !owns_card(&connection, LOCAL_USER_ID, kind, entity_id)? {
        return Err("card is not in the collection".into());
    }
    if let Some(url) = image_url.as_deref() {
        let cached = get_card_gallery(&connection, kind, entity_id)?
            .ok_or_else(|| "load the card gallery before choosing art".to_string())?;
        if !parse_images(&cached.images_json)
            .iter()
            .any(|image| image.url == url)
        {
            return Err("chosen art is not part of this card gallery".into());
        }
    }
    set_card_preferred_image(&connection, kind, entity_id, image_url.as_deref())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn character(id: i64, name: &str) -> tenrai::TenraiCharacter {
        tenrai::TenraiCharacter {
            mal_id: id,
            name: name.into(),
            role: Some("Main".into()),
        }
    }

    #[test]
    fn matches_reordered_and_punctuated_names() {
        let characters = vec![
            character(45627, "Ackerman, Levi"),
            character(71, "Yeager, Eren"),
        ];
        assert_eq!(
            match_character("Levi Ackerman", &characters).map(|item| item.mal_id),
            Some(45627)
        );
        assert_eq!(
            match_character("Eren Yeager", &characters).map(|item| item.mal_id),
            Some(71)
        );
    }

    #[test]
    fn falls_back_to_a_containing_name_only_for_meaningful_tokens() {
        let characters = vec![character(1, "Luffy Monkey D."), character(2, "Nami")];
        assert_eq!(
            match_character("Monkey D. Luffy", &characters).map(|item| item.mal_id),
            Some(1)
        );
        assert_eq!(
            match_character("Unknown", &characters).map(|item| item.mal_id),
            None
        );
    }

    #[test]
    fn unsupported_kinds_are_rejected_before_any_network_call() {
        assert!(!supported(CardKind::Staff));
        assert!(!supported(CardKind::Studio));
        assert!(supported(CardKind::Anime));
    }
}
