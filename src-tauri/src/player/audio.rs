use super::core::PlayerCore;
use serde_json::Value;

pub(super) fn resolve_device(preferred: &str, devices: &Value) -> Result<String, String> {
    let devices = devices.as_array().ok_or("invalid audio-device-list")?;
    Ok(if preferred == "auto"
        || devices
            .iter()
            .any(|device| device.get("name").and_then(Value::as_str) == Some(preferred))
    {
        preferred
    } else {
        "auto"
    }
    .to_string())
}
pub(super) fn set_property(
    backend: &impl PlayerCore,
    name: &str,
    value: &Value,
    label: &str,
) -> Result<(), String> {
    if name != "audio-device" {
        return backend.set_property(name, value, label);
    }
    let preferred = value.as_str().ok_or("audio device must be a string")?;
    let raw = backend.get_property("audio-device-list", "json", label)?;
    let devices = if let Some(text) = raw.as_str() {
        serde_json::from_str(text).map_err(|error| format!("invalid audio-device-list: {error}"))?
    } else {
        raw
    };
    let selected = resolve_device(preferred, &devices)?;
    backend.set_property(name, &Value::String(selected), label)
}
pub(super) fn reconcile(app: &tauri::AppHandle, devices: &Value) {
    let backend = super::session::core(app);
    let label = super::PLAYER_WINDOW_LABEL;
    let result = (|| {
        let current = backend.get_property("audio-device", "string", label)?;
        let current = current.as_str().ok_or("invalid current audio device")?;
        let selected = resolve_device(current, devices)?;
        if current != selected {
            backend.set_property("audio-device", &Value::String(selected), label)?;
        }
        Ok::<(), String>(())
    })();
    if let Err(error) = result {
        tracing::warn!("player audio-device reconciliation failed: {error}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Output {
        fail: bool,
        writes: std::sync::Mutex<Vec<Value>>,
    }
    impl PlayerCore for Output {
        fn init(&self, _: tauri_plugin_libmpv::MpvConfig, _: &str) -> Result<String, String> {
            unreachable!()
        }
        fn destroy(&self, _: &str) -> Result<(), String> {
            unreachable!()
        }
        fn command(&self, _: &str, _: &[Value], _: &str) -> Result<(), String> {
            unreachable!()
        }
        fn set_video_margin_ratio(
            &self,
            _: tauri_plugin_libmpv::VideoMarginRatio,
            _: &str,
        ) -> Result<(), String> {
            unreachable!()
        }
        fn get_property(&self, _: &str, _: &str, _: &str) -> Result<Value, String> {
            Ok(serde_json::json!([{ "name": "wasapi/speakers" }]))
        }
        fn set_property(&self, _: &str, value: &Value, _: &str) -> Result<(), String> {
            if self.fail {
                return Err("device rejected selection".into());
            }
            self.writes.lock().unwrap().push(value.clone());
            Ok(())
        }
    }
    #[test]
    fn selection_reports_failure_and_resolves_missing_output() {
        let output = Output {
            fail: false,
            writes: std::sync::Mutex::default(),
        };
        set_property(
            &output,
            "audio-device",
            &Value::String("wasapi/speakers".into()),
            "player",
        )
        .unwrap();
        set_property(
            &output,
            "audio-device",
            &Value::String("missing".into()),
            "player",
        )
        .unwrap();
        assert_eq!(
            *output.writes.lock().unwrap(),
            vec![
                Value::String("wasapi/speakers".into()),
                Value::String("auto".into())
            ]
        );
        let failed = Output {
            fail: true,
            writes: std::sync::Mutex::default(),
        };
        assert!(set_property(
            &failed,
            "audio-device",
            &Value::String("wasapi/speakers".into()),
            "player"
        )
        .is_err());
        assert!(failed.writes.lock().unwrap().is_empty());
    }
    #[test]
    fn missing_device_temporarily_uses_auto() {
        let devices = serde_json::json!([{ "name": "wasapi/headphones" }]);
        assert_eq!(
            resolve_device("wasapi/headphones", &devices).unwrap(),
            "wasapi/headphones"
        );
        assert_eq!(resolve_device("wasapi/hdmi", &devices).unwrap(), "auto");
        assert_eq!(resolve_device("auto", &devices).unwrap(), "auto");
        assert!(resolve_device("auto", &Value::Null).is_err());
    }
}
