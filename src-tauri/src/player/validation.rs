use serde_json::Value;

pub fn stream(stream: &super::state::StreamOpen) -> Result<(), String> {
    let url = reqwest::Url::parse(&stream.media_url).map_err(|_| "invalid stream URL")?;
    if !["https", "http"].contains(&url.scheme()) || url.host_str().is_none() {
        return Err("stream playback requires an HTTP or HTTPS media URL".into());
    }
    if stream.watch_key.is_empty() || stream.watch_key.len() > 480 {
        return Err("invalid stream watch key".into());
    }
    if stream.headers.len() > 64
        || stream
            .headers
            .iter()
            .map(|(name, value)| name.len() + value.len())
            .sum::<usize>()
            > 32 * 1024
    {
        return Err("stream headers are too large".into());
    }
    Ok(())
}

pub fn command(name: &str, args: &[Value]) -> Result<(), String> {
    if ![
        "seek",
        "playlist-play-index",
        "playlist-remove",
        "playlist-move",
        "playlist-next",
        "playlist-prev",
        "frame-step",
        "frame-back-step",
        "sub-add",
        "audio-add",
        "change-list",
        "set",
    ]
    .contains(&name)
    {
        return Err(format!("player command is not allowed: {name}"));
    }
    if args.len() > 8
        || args
            .iter()
            .any(|value| !value.is_string() && !value.is_number())
    {
        return Err("invalid player command arguments".into());
    }
    if name == "change-list" && args.first().and_then(Value::as_str) != Some("glsl-shaders") {
        return Err("only bundled player shaders may be changed".into());
    }
    if name == "set" {
        let property_name = args
            .first()
            .and_then(Value::as_str)
            .ok_or("missing property name")?;
        let value = args.get(1).ok_or("missing property value")?;
        property(property_name, value)?;
    }
    Ok(())
}

pub fn property(name: &str, value: &Value) -> Result<(), String> {
    if ![
        "hwdec",
        "volume",
        "mute",
        "pause",
        "speed",
        "aid",
        "sid",
        "sub-delay",
        "audio-delay",
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
        "tone-mapping",
        "target-peak",
        "hdr-compute-peak",
        "target-prim",
        "target-trc",
        "af",
        "vf",
        "keepaspect",
        "video-aspect-override",
        "video-rotate",
        "panscan",
        "video-zoom",
        "glsl-shaders",
        "glsl-shader-opts",
        "keep-open",
        "loop-file",
        "loop-playlist",
        "demuxer-readahead-secs",
    ]
    .contains(&name)
    {
        return Err(format!("player property is not allowed: {name}"));
    }
    if !value.is_boolean() && !value.is_number() && !value.is_string() {
        return Err("player properties must be scalar values".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn execution_and_unrelated_option_changes_are_rejected() {
        assert!(command("run", &[json!("cmd.exe")]).is_err());
        assert!(command("subprocess", &[]).is_err());
        assert!(property("input-ipc-server", &json!("pipe")).is_err());
        assert!(command(
            "change-list",
            &[json!("script-opts"), json!("set"), json!("x")]
        )
        .is_err());
        assert!(command("seek", &[json!(20), json!("absolute+exact")]).is_ok());
        assert!(property("pause", &json!(true)).is_ok());
    }
}
