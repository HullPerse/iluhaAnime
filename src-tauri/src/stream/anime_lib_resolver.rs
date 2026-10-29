//! AnimeLib playback source helpers.
//!
//! The source list is produced by the client and handed to the player as it
//! is; which entry plays and when to switch are player concerns, not source
//! concerns. This module keeps the two things that must not be re-implemented
//! per call site: the synthetic watch key and the URL guard.

use crate::stream::anime_lib_models::{StreamResolutionError, StreamVariant};
use url::Url;

/// Build the synthetic watch key for a stream session.
///
/// Format: `stream:<sourceId>:<mediaId>:<episodeId>`. Independent of the
/// expiring media URL so a resume position survives URL rotation.
pub fn build_watch_key(source_id: &str, media_id: &str, episode_id: &str) -> String {
    format!("stream:{source_id}:{media_id}:{episode_id}")
}

/// Validate that a media URL is an http(s) URL libmpv can open.
pub fn validate_media_url(url: &str) -> Result<(), StreamResolutionError> {
    let parsed = Url::parse(url).map_err(|_| StreamResolutionError::UnsupportedFormat {
        message: format!("invalid media URL: {url}"),
    })?;
    match parsed.scheme() {
        "http" | "https" => Ok(()),
        scheme => Err(StreamResolutionError::UnsupportedFormat {
            message: format!("unsupported scheme {scheme} for {url}"),
        }),
    }
}

/// Drop every candidate whose URL mpv could not open, keeping the rest.
///
/// A source that answers one bad URL is not a broken source; reporting the
/// good ones beats failing the whole episode.
pub fn keep_playable(variants: Vec<StreamVariant>) -> Vec<StreamVariant> {
    variants
        .into_iter()
        .filter(|variant| validate_media_url(&variant.url).is_ok())
        .collect()
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use super::*;

    fn variant(url: &str) -> StreamVariant {
        StreamVariant {
            variant_id: "Kodik:32416".to_string(),
            quality: "1080".to_string(),
            label: "1080".to_string(),
            url: url.to_string(),
            r#type: "m3u8".to_string(),
            headers: BTreeMap::new(),
            subtitles: vec![],
            audio_tracks: vec![],
        }
    }

    #[test]
    fn watch_key_format() {
        assert_eq!(
            build_watch_key("animelib", "11", "455"),
            "stream:animelib:11:455"
        );
    }

    #[test]
    fn watch_key_is_not_a_url() {
        let key = build_watch_key("animelib", "11", "455");
        assert!(!key.contains("http"));
    }

    #[test]
    fn only_http_urls_survive() {
        let kept = keep_playable(vec![
            variant("https://cdn.example/720.m3u8"),
            variant("ftp://cdn.example/720.mp4"),
            variant("not a url"),
            variant("http://cdn.example/360.mp4"),
        ]);
        assert_eq!(kept.len(), 2);
        assert_eq!(kept[0].url, "https://cdn.example/720.m3u8");
        assert_eq!(kept[1].url, "http://cdn.example/360.mp4");
    }

    #[test]
    fn a_scheme_less_url_is_rejected() {
        assert!(matches!(
            validate_media_url("//cdn.example/720.m3u8"),
            Err(StreamResolutionError::UnsupportedFormat { .. })
        ));
    }
}
