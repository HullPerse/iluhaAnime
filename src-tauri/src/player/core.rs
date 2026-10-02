use serde_json::Value;
use tauri::AppHandle;
use tauri_plugin_libmpv::{MpvConfig, MpvExt, VideoMarginRatio};

pub trait PlayerCore: Send + Sync {
    fn init(&self, config: MpvConfig, window: &str) -> Result<String, String>;

    fn destroy(&self, window: &str) -> Result<(), String>;

    fn command(&self, name: &str, args: &[Value], window: &str) -> Result<(), String>;

    fn set_property(&self, name: &str, value: &Value, window: &str) -> Result<(), String>;

    fn get_property(&self, name: &str, format: &str, window: &str) -> Result<Value, String>;

    fn set_video_margin_ratio(&self, ratio: VideoMarginRatio, window: &str) -> Result<(), String>;
}

pub struct LibmpvCore {
    app: AppHandle,
}

impl LibmpvCore {
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }
}

impl PlayerCore for LibmpvCore {
    fn init(&self, config: MpvConfig, window: &str) -> Result<String, String> {
        self.app
            .mpv()
            .init(config, window)
            .map_err(|error| error.to_string())
    }

    fn destroy(&self, window: &str) -> Result<(), String> {
        self.app
            .mpv()
            .destroy(window)
            .map_err(|error| error.to_string())
    }

    fn command(&self, name: &str, args: &[Value], window: &str) -> Result<(), String> {
        self.app
            .mpv()
            .command(name, &args.to_vec(), window)
            .map_err(|error| error.to_string())
    }

    fn set_property(&self, name: &str, value: &Value, window: &str) -> Result<(), String> {
        self.app
            .mpv()
            .set_property(name, value, window)
            .map_err(|error| error.to_string())
    }

    fn get_property(&self, name: &str, format: &str, window: &str) -> Result<Value, String> {
        self.app
            .mpv()
            .get_property(name.to_string(), format.to_string(), window)
            .map_err(|error| error.to_string())
    }

    fn set_video_margin_ratio(&self, ratio: VideoMarginRatio, window: &str) -> Result<(), String> {
        self.app
            .mpv()
            .set_video_margin_ratio(ratio, window)
            .map_err(|error| error.to_string())
    }
}
