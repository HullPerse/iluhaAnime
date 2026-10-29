//! Per-title stream preferences.
//!
//! A voice-over, a quality and the chosen audio/subtitle language are title
//! choices: they should survive the next episode and the next launch. The
//! resume position is per episode and stays in `player::watch`, so it is not
//! part of this record.
//!
//! Stored in the existing app cache under the `stream` namespace rather than a
//! dedicated table: it is the same mechanism the watch position uses, has no
//! schema migration and is written on every switch.

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::app_db;

const PREFS_NAMESPACE: &str = "stream";
const PREFS_KEY_PREFIX: &str = "prefs:";
const MAX_FIELD_LEN: usize = 256;

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StreamPrefs {
    pub source_id: String,
    pub media_id: String,
    /// `<player>:<teamId>`, for example `Kodik:32412`. Episode independent.
    #[serde(default)]
    pub variant_id: String,
    /// Quality label, for example `720p`. Empty means "best available".
    #[serde(default)]
    pub quality: String,
    /// Language code (or track title) of the chosen audio track.
    #[serde(default)]
    pub audio_lang: String,
    /// Language code (or track title) of the chosen subtitle track.
    #[serde(default)]
    pub sub_lang: String,
    /// Whether subtitles are shown at all.
    #[serde(default = "subs_on")]
    pub sub_enabled: bool,
    #[serde(default)]
    pub updated_at: i64,
}

fn subs_on() -> bool {
    true
}

fn prefs_key(source_id: &str, media_id: &str) -> String {
    format!("{PREFS_KEY_PREFIX}{source_id}:{media_id}")
}

fn validate(prefs: &StreamPrefs) -> Result<(), String> {
    if prefs.source_id.trim().is_empty() || prefs.media_id.trim().is_empty() {
        return Err("stream preferences need a source and a media id".to_string());
    }
    for (name, value) in [
        ("sourceId", &prefs.source_id),
        ("mediaId", &prefs.media_id),
        ("variantId", &prefs.variant_id),
        ("quality", &prefs.quality),
        ("audioLang", &prefs.audio_lang),
        ("subLang", &prefs.sub_lang),
    ] {
        if value.len() > MAX_FIELD_LEN {
            return Err(format!("stream preference {name} is too long"));
        }
    }
    Ok(())
}

pub fn load(app: &AppHandle, source_id: &str, media_id: &str) -> Option<StreamPrefs> {
    if source_id.is_empty() || media_id.is_empty() {
        return None;
    }
    let payload =
        app_db::read_cached_payload(app, PREFS_NAMESPACE, &prefs_key(source_id, media_id))
            .ok()??;
    serde_json::from_str(&payload).ok()
}

pub fn save(app: &AppHandle, mut prefs: StreamPrefs) -> Result<(), String> {
    validate(&prefs)?;
    prefs.updated_at = crate::app_db::now_seconds();
    let payload = serde_json::to_string(&prefs).map_err(|error| error.to_string())?;
    app_db::put_app_cache(
        app.clone(),
        PREFS_NAMESPACE.to_string(),
        prefs_key(&prefs.source_id, &prefs.media_id),
        payload,
        None,
    )
}

#[tauri::command]
pub fn stream_prefs_get(
    app: AppHandle,
    source_id: String,
    media_id: String,
) -> Result<Option<StreamPrefs>, String> {
    Ok(load(&app, &source_id, &media_id))
}

#[tauri::command]
pub fn stream_prefs_save(app: AppHandle, prefs: StreamPrefs) -> Result<(), String> {
    save(&app, prefs)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_key_is_scoped_to_source_and_title() {
        assert_eq!(prefs_key("animelib", "11"), "prefs:animelib:11");
    }

    #[test]
    fn a_record_without_ids_is_rejected() {
        assert!(validate(&StreamPrefs::default()).is_err());
        assert!(validate(&StreamPrefs {
            source_id: "animelib".to_string(),
            media_id: "11".to_string(),
            ..Default::default()
        })
        .is_ok());
    }

    #[test]
    fn a_record_round_trips_through_json() {
        let prefs = StreamPrefs {
            source_id: "animelib".to_string(),
            media_id: "11".to_string(),
            variant_id: "Kodik:32412".to_string(),
            quality: "720p".to_string(),
            audio_lang: "ru".to_string(),
            sub_lang: "no".to_string(),
            sub_enabled: false,
            updated_at: 1,
        };
        let text = serde_json::to_string(&prefs).expect("serializes");
        let back: StreamPrefs = serde_json::from_str(&text).expect("deserializes");
        assert_eq!(back, prefs);
    }

    #[test]
    fn the_wire_shape_is_camel_case_with_subs_on_by_default() {
        let prefs: StreamPrefs =
            serde_json::from_str(r#"{"sourceId":"animelib","mediaId":"11"}"#).expect("parses");
        assert_eq!(prefs.source_id, "animelib");
        assert!(prefs.sub_enabled);
        let json = serde_json::to_value(&prefs).expect("serializes");
        assert_eq!(json["sourceId"], "animelib");
        assert_eq!(json["mediaId"], "11");
    }
}
