//! AnimeLib domain models.
//!
//! Normalized types that describe an AnimeLib title, its episodes, and the
//! playback variants available for an episode. These are source-specific
//! concepts normalized into the streaming domain layer.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// A normalized AnimeLib anime / title.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimeLibAnime {
    pub id: String,
    pub title: String,
    pub synonyms: Vec<String>,
    pub cover: Option<String>,
    pub banner: Option<String>,
    pub description: Option<String>,
    pub year: Option<i32>,
    pub status: Option<String>,
    pub genres: Vec<String>,
    pub episode_count: Option<i32>,
    pub anilist_id: Option<i64>,
    pub sub_or_dub: Option<String>,
    pub slug_url: String,
}

/// One page of the AnimeLib catalog.
///
/// `last_page` and `total` are what the API's `meta` reports. Both are
/// optional because the site does not document its pagination envelope; when
/// they are missing the UI falls back to a page-size estimate.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimeLibSearchPage {
    pub items: Vec<AnimeLibAnime>,
    pub page: i32,
    pub last_page: Option<i32>,
    pub total: Option<i32>,
}

/// The catalog filters the site's `mediaFilter` model exposes.
///
/// The API accepts them as repeated query params (`types[]`, `genres[]`,
/// `caution[]`, and so on). `adult` is a UI rule rather than a wire param: the
/// site hides the 18+ age rating and adult genres until the viewer opts in.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AnimeLibSearchFilters {
    #[serde(default)]
    pub types: Vec<i32>,
    #[serde(default)]
    pub genres: Vec<i32>,
    #[serde(default)]
    pub statuses: Vec<i32>,
    /// Age restriction ids (`1` PG, `2` PG-13, `3` R-17, `4` R+, `5` 18+).
    #[serde(default)]
    pub age_ratings: Vec<i32>,
    #[serde(default)]
    pub year_min: Option<i32>,
    #[serde(default)]
    pub year_max: Option<i32>,
    #[serde(default)]
    pub episodes_min: Option<i32>,
    #[serde(default)]
    pub episodes_max: Option<i32>,
    #[serde(default)]
    pub sort_by: Option<String>,
    #[serde(default)]
    pub sort_type: Option<String>,
    /// Whether the 18+ age rating and adult genres are part of the request.
    #[serde(default)]
    pub adult: bool,
}

/// One selectable value of the AnimeLib catalog filters.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimeLibFilterOption {
    pub id: i32,
    pub label: String,
}

/// A genre in the AnimeLib catalog; `adult` genres stay hidden until NSFW is
/// enabled.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimeLibGenreOption {
    pub id: i32,
    pub label: String,
    pub adult: bool,
}

/// The filter options the AnimeLib filters modal offers, filtered to the
/// AnimeLib site (`site_id` 5) instead of the manga sites the same API serves.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimeLibConstants {
    pub types: Vec<AnimeLibFilterOption>,
    pub statuses: Vec<AnimeLibFilterOption>,
    pub age_ratings: Vec<AnimeLibFilterOption>,
    pub genres: Vec<AnimeLibGenreOption>,
}

/// A normalized AnimeLib episode.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimeLibEpisode {
    pub id: String,
    pub number: i32,
    pub title: Option<String>,
    pub air_date: Option<String>,
    pub duration: Option<i32>,
    pub cover: Option<String>,
}

/// A playback variant (voice-over) for an episode.
///
/// `id` is the site's team id, `player` names the hoster (`Kodik` for every
/// row verified so far) and `source_url` is the hoster's own player URL. The
/// pair `player` plus `id` is the variant's identity inside an episode.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimeLibVariant {
    pub id: String,
    pub name: String,
    /// The translation kind label, for example `Ozвучка` or `Субтитры`.
    pub language: Option<String>,
    /// Whether this variant needs its own stream URL (true) or is an audio
    /// track inside one stream (false). Every verified row is `true`.
    pub separate_stream: bool,
    /// The hoster name, for example `Kodik`.
    pub player: String,
    /// The hoster's player URL. Empty for a row the site serves itself.
    pub source_url: String,
}

/// A resolved stream variant: a concrete media URL with quality and headers.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamVariant {
    pub variant_id: String,
    pub quality: String,
    pub label: String,
    pub url: String,
    /// `mp4`, `m3u8`, `dash` or `unknown`.
    pub r#type: String,
    /// Request headers the media host needs, as a JSON object for the player.
    pub headers: BTreeMap<String, String>,
    pub subtitles: Vec<SubtitleTrack>,
    pub audio_tracks: Vec<AudioTrack>,
}

/// An external subtitle track.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleTrack {
    pub id: String,
    pub url: String,
    pub language: String,
    pub is_default: bool,
    pub headers: BTreeMap<String, String>,
}

/// An audio track within a media stream.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioTrack {
    pub id: String,
    pub language: String,
    pub title: Option<String>,
    pub default: bool,
}

/// Source-specific error returned when resolution fails.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "code")]
pub enum StreamResolutionError {
    #[serde(rename = "no_variants")]
    NoVariants { message: String },
    #[serde(rename = "expired_url")]
    ExpiredUrl { message: String },
    #[serde(rename = "network_error")]
    NetworkError { message: String },
    #[serde(rename = "unsupported_format")]
    UnsupportedFormat { message: String },
    #[serde(rename = "geo_blocked")]
    GeoBlocked { message: String },
    #[serde(rename = "auth_required")]
    AuthRequired { message: String },
    #[serde(rename = "unknown")]
    Unknown { message: String },
}

impl std::fmt::Display for StreamResolutionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StreamResolutionError::NoVariants { message } => write!(f, "no variants: {message}"),
            StreamResolutionError::ExpiredUrl { message } => write!(f, "expired url: {message}"),
            StreamResolutionError::NetworkError { message } => {
                write!(f, "network error: {message}")
            }
            StreamResolutionError::UnsupportedFormat { message } => {
                write!(f, "unsupported format: {message}")
            }
            StreamResolutionError::GeoBlocked { message } => write!(f, "geo blocked: {message}"),
            StreamResolutionError::AuthRequired { message } => {
                write!(f, "auth required: {message}")
            }
            StreamResolutionError::Unknown { message } => write!(f, "unknown error: {message}"),
        }
    }
}

impl std::error::Error for StreamResolutionError {}
