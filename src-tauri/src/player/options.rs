//! mpv options the player writes itself.
//!
//! Everything here is pure: a value in, an mpv option object out. Keeping the
//! allow-list, the cache profiles and the header sanitizing together means a
//! change to playback policy does not require reading the command surface.

use serde_json::{json, Value};
use std::collections::BTreeMap;

use crate::scrapers::clients::proxy_with_remote_dns;

use super::core::{LibmpvCore, PlayerCore};

pub(crate) fn observed_properties() -> Value {
    json!({
        "time-pos": "double",
        "duration": "double",
        "pause": "flag",
        "eof-reached": "flag",
        "speed": "double",
        "volume": "double",
        "mute": "flag",
        "playlist-pos": "int64",
        "playlist-count": "int64",
        "path": "string",
        "paused-for-cache": "flag",
        // Cache counters drive the buffering overlay. Without observing them a
        // stalled stream stops changing time-pos, so no snapshot is emitted and
        // the overlay never appears.
        "cache-buffering-state": "double",
        "cache-speed": "double",
        "demuxer-cache-duration": "double",
        "track-list": "node",
        "chapter-list": "node",
    })
}

pub(crate) fn with_structural_options(options: Value) -> Value {
    let mut map = options.as_object().cloned().unwrap_or_default();
    for (key, value) in [
        ("idle", json!("yes")),
        ("osc", json!("no")),
        ("terminal", json!("no")),
        ("input-default-bindings", json!("no")),
        ("input-vo-keyboard", json!("no")),
        ("vo", json!("gpu-next")),
    ] {
        map.insert(key.to_string(), value);
    }
    Value::Object(map)
}

const ALLOWED_INITIAL_OPTIONS: &[&str] = &[
    "hwdec",
    "volume",
    "mute",
    "keep-open",
    "video-rotate",
    "panscan",
    "video-zoom",
    "brightness",
    "contrast",
    "saturation",
    "hue",
    "sub-font-size",
    "sub-font",
    "sub-color",
    "sub-back-color",
    "sub-use-margins",
    "sub-ass-force-margins",
    "vf",
    "keepaspect",
    "video-aspect-override",
    "video-margin-ratio-top",
    "video-margin-ratio-bottom",
    "video-margin-ratio-left",
    "video-margin-ratio-right",
];

pub(crate) fn sanitize_initial_options(options: Value) -> Value {
    let Some(map) = options.as_object() else {
        return options;
    };
    let mut kept = serde_json::Map::new();
    for (key, value) in map {
        if ALLOWED_INITIAL_OPTIONS.contains(&key.as_str()) {
            kept.insert(key.clone(), value.clone());
        } else {
            tracing::warn!(
                key,
                "player_init: dropping unrecognized mpv option (would hang mpv initialization)"
            );
        }
    }
    Value::Object(kept)
}

/// Build mpv's `http-header-fields` value: `Name: value,Name2: value2`.
///
/// A name or value that could split the option (comma, colon in the name,
/// CR/LF) is dropped instead of injected: the value comes from a remote API.
pub(crate) fn header_fields(headers: &BTreeMap<String, String>) -> String {
    headers
        .iter()
        .filter_map(|(name, value)| {
            let name = name.trim();
            let value = value.trim();
            if name.is_empty() || value.is_empty() {
                return None;
            }
            let bad = |text: &str| text.contains(['\r', '\n', ',']);
            if bad(name) || name.contains(':') || bad(value) {
                return None;
            }
            Some(format!("{name}: {value}"))
        })
        .collect::<Vec<_>>()
        .join(",")
}

/// Preserve the proxy's DNS policy for the libcurl network backend.
/// `socks5` must become `socks5h` so hostnames are resolved by the proxy, not
/// by mpv's local resolver. Otherwise an HTTP client and the player can behave
/// differently on the same setting.
pub(crate) fn mpv_proxy(url: &str) -> String {
    proxy_with_remote_dns(url.trim().to_string())
}

/// mpv's cache settings for a stream source.
///
/// `--cache-secs` is the real readahead bound for a network stream: when the
/// cache is active it overrides `--demuxer-readahead-secs`, so setting only the
/// latter left `--demuxer-max-bytes` as the sole limit and let a low-bitrate
/// episode fill most of that budget with the whole file. The byte caps still
/// guard 4K, the hysteresis keeps mpv from restarting the download on every
/// tick, and `cache-pause-initial` turns a stuttering first second into one
/// honest buffering screen.
/// Below this the next stream gets the deeper cache profile: ~3 Mbit/s is
/// already less than one 1080p Kodik segment per two seconds, so a 30 s window
/// is only a few good seconds ahead of a network hiccup.
pub(crate) const SLOW_STREAM_BYTES_PER_SECOND: f64 = 384.0 * 1024.0;

/// mpv's cache settings for a stream source.
///
/// `slow` is the speed measured on the previous stream: a lagging VPN gets a
/// 60 s window and a longer initial fill, a healthy one keeps the small profile
/// that seeks faster. `reconnect` lets lavf ride out a dropped connection
/// without ending the file; `network-timeout` keeps a dead route from hanging
/// the player for the full 20 s before the route retry can take over.
pub(crate) fn stream_cache_options(initial_pause: bool, slow: bool) -> Value {
    json!({
        "cache": "yes",
        "cache-secs": if slow { 60.0 } else { 30.0 },
        "demuxer-max-bytes": if slow { "256MiB" } else { "192MiB" },
        "demuxer-max-back-bytes": "64MiB",
        "demuxer-hysteresis-secs": 10.0,
        // A fresh episode gets the buffering screen instead of a stuttering
        // first second. A voice-over/quality switch resumes mid-file: the user
        // already waited for the resolve, so start as soon as mpv can decode.
        "cache-pause-initial": if initial_pause { "yes" } else { "no" },
        "cache-pause-wait": if slow && initial_pause { 6.0 } else { 2.0 },
        "network-timeout": 15.0,
        "stream-lavf-o": "reconnect=1,reconnect_streamed=1,reconnect_delay_max=5",
    })
}

/// Cache settings for a local file.
///
/// mpv keeps the stream profile on the instance across files, so every local
/// load has to write its own policy back: `cache=auto` hands the on/off
/// decision back to mpv (it stays off for a normal disk), and the readahead and
/// packet caps return to the local shape. Without this a local 4K file played
/// with the stream's 192 MiB queue and the timeline reported a network-sized
/// cache for a file on disk.
pub(crate) fn local_cache_options(readahead_secs: f64) -> Value {
    json!({
        "cache": "auto",
        "cache-secs": 30.0,
        "demuxer-readahead-secs": readahead_secs.clamp(0.1, 30.0),
        "demuxer-max-bytes": "64MiB",
        "demuxer-max-back-bytes": "16MiB",
    })
}

pub(crate) fn apply_options(
    backend: &LibmpvCore,
    options: &Value,
    window: &str,
    scope: &str,
) -> Result<(), String> {
    let Some(map) = options.as_object() else {
        return Ok(());
    };
    for (name, value) in map {
        backend
            .set_property(name, value, window)
            .map_err(|error| format!("set {name} for {scope}: {error}"))?;
    }
    Ok(())
}

/// Maps an end-of-file mode onto mpv properties.
/// `none` stops after the current file (`keep-open=always` pauses on the last
/// frame and never auto-advances, the Finished screen covers it).
/// `pause` plays through the playlist and pauses on the last frame of the
/// last file. `next` plays through and idles at the end. `repeat` loops
/// the current file.
pub(crate) fn eof_properties(mode: &str) -> Option<(&'static str, &'static str, &'static str)> {
    match mode {
        "none" => Some(("always", "no", "no")),
        "pause" => Some(("yes", "no", "no")),
        "next" => Some(("no", "no", "no")),
        "repeat" => Some(("no", "inf", "no")),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::collections::BTreeMap;

    #[test]
    fn mpv_proxy_preserves_remote_dns_schemes() {
        assert_eq!(
            mpv_proxy("socks5h://127.0.0.1:10808"),
            "socks5h://127.0.0.1:10808"
        );
        assert_eq!(
            mpv_proxy("socks5://127.0.0.1:10808"),
            "socks5h://127.0.0.1:10808"
        );
        assert_eq!(
            mpv_proxy("socks4a://127.0.0.1:1080"),
            "socks4a://127.0.0.1:1080"
        );
        assert_eq!(
            mpv_proxy("socks4://127.0.0.1:1080"),
            "socks4a://127.0.0.1:1080"
        );
        assert_eq!(
            mpv_proxy(" http://127.0.0.1:7890 "),
            "http://127.0.0.1:7890"
        );
        assert_eq!(mpv_proxy(""), "");
    }

    #[test]
    fn buffering_properties_are_observed_so_a_stalled_stream_still_reports() {
        let properties = observed_properties();
        assert_eq!(properties["paused-for-cache"], "flag");
        assert_eq!(properties["cache-buffering-state"], "double");
        assert_eq!(properties["cache-speed"], "double");
        assert_eq!(properties["demuxer-cache-duration"], "double");
    }

    #[test]
    fn streams_get_a_time_bounded_cache() {
        let options = stream_cache_options(true, false);
        // `cache-secs` is the option mpv actually honours while the network
        // cache is on; `demuxer-readahead-secs` would be overridden by its
        // "very high" default and leave the byte cap as the only bound.
        assert_eq!(options["cache"], "yes");
        let cache_secs = options["cache-secs"]
            .as_f64()
            .expect("cache-secs is a number");
        assert!(cache_secs >= 10.0 && cache_secs <= 60.0);
        assert_eq!(options["demuxer-max-bytes"], "192MiB");
        assert_eq!(options["demuxer-max-back-bytes"], "64MiB");
        assert!(options.get("demuxer-readahead-secs").is_none());
        assert_eq!(options["cache-pause-initial"], "yes");
        assert_eq!(options["network-timeout"], 15.0);
        // A dropped connection is retried by lavf instead of ending the file.
        assert_eq!(
            options["stream-lavf-o"],
            "reconnect=1,reconnect_streamed=1,reconnect_delay_max=5"
        );
    }

    #[test]
    fn a_switch_does_not_wait_for_the_initial_buffer() {
        // A switch or resume starts mid-file, so the 2 s initial cache pause
        // only adds delay to a change the user already waited for.
        assert_eq!(
            stream_cache_options(false, false)["cache-pause-initial"],
            "no"
        );
        assert_eq!(
            stream_cache_options(true, false)["cache-pause-initial"],
            "yes"
        );
    }

    #[test]
    fn a_slow_stream_gets_a_deeper_buffer() {
        let fast = stream_cache_options(true, false);
        let slow = stream_cache_options(true, true);
        assert!(
            slow["cache-secs"].as_f64().unwrap_or_default()
                > fast["cache-secs"].as_f64().unwrap_or_default()
        );
        assert_eq!(slow["demuxer-max-bytes"], "256MiB");
        assert_eq!(slow["cache-pause-wait"], 6.0);
        assert_eq!(fast["cache-pause-wait"], 2.0);
        // A switch already waited for the resolve, so no initial pause even
        // when the previous stream was slow.
        assert_eq!(
            stream_cache_options(false, true)["cache-pause-initial"],
            "no"
        );
    }

    #[test]
    fn local_loads_restore_a_small_cache_after_a_stream() {
        let options = local_cache_options(1.0);
        // The stream turned the cache on explicitly and kept a 30 s bound on
        // the instance; a local file hands that decision back to mpv.
        assert_eq!(options["cache"], "auto");
        assert_eq!(options["demuxer-readahead-secs"], 1.0);
        assert_eq!(options["demuxer-max-bytes"], "64MiB");
        assert_eq!(options["demuxer-max-back-bytes"], "16MiB");
        // A bad profile value must not become an mpv option mpv rejects later.
        assert_eq!(local_cache_options(0.0)["demuxer-readahead-secs"], 0.1);
        assert_eq!(local_cache_options(120.0)["demuxer-readahead-secs"], 30.0);
    }

    #[test]
    fn headers_are_comma_joined_without_extra_spaces() {
        let mut headers = BTreeMap::new();
        headers.insert("Referer".to_string(), "https://anilib.me/ru/".to_string());
        headers.insert("User-Agent".to_string(), "Test/1".to_string());
        assert_eq!(
            header_fields(&headers),
            "Referer: https://anilib.me/ru/,User-Agent: Test/1"
        );
    }

    #[test]
    fn headers_that_could_split_the_option_are_dropped() {
        let mut headers = BTreeMap::new();
        headers.insert("Bad,Name".to_string(), "x".to_string());
        headers.insert("X-Injected".to_string(), "a\r\nY: b".to_string());
        headers.insert("Empty".to_string(), "  ".to_string());
        headers.insert("Good".to_string(), "https://cdn.example/a.m3u8".to_string());
        assert_eq!(header_fields(&headers), "Good: https://cdn.example/a.m3u8");
    }

    #[test]
    fn no_headers_produce_the_empty_value_that_clears_mpv() {
        assert_eq!(header_fields(&BTreeMap::new()), "");
    }

    #[test]
    fn eof_modes_map_to_mpv_keep_open_and_loop_properties() {
        assert_eq!(eof_properties("none"), Some(("always", "no", "no")));
        assert_eq!(eof_properties("pause"), Some(("yes", "no", "no")));
        assert_eq!(eof_properties("next"), Some(("no", "no", "no")));
        assert_eq!(eof_properties("repeat"), Some(("no", "inf", "no")));
    }

    #[test]
    fn unknown_eof_mode_maps_to_nothing() {
        assert_eq!(eof_properties("loop-everything"), None);
        assert_eq!(eof_properties(""), None);
    }

    #[test]
    fn unlisted_initial_options_are_dropped_and_structural_ones_win() {
        let kept = sanitize_initial_options(json!({
            "volume": 40,
            "input-ipc-server": "pipe",
            "script-opts": "x=y",
        }));
        assert_eq!(kept["volume"], 40);
        assert!(kept.get("input-ipc-server").is_none());
        assert!(kept.get("script-opts").is_none());

        let options = with_structural_options(json!({ "idle": "no", "volume": 40 }));
        assert_eq!(options["idle"], "yes");
        assert_eq!(options["vo"], "gpu-next");
        assert_eq!(options["volume"], 40);
    }
}
