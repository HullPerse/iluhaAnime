use std::sync::atomic::Ordering;

use serde::Deserialize;
use serde_json::json;
use tauri::{Manager, WebviewWindow};

use super::core::PlayerCore;
use super::session::{core, on_player};
use super::{PlayerHost, PLAYER_WINDOW_LABEL};

#[cfg(windows)]
pub(super) mod native;

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LoupeFrame {
    bounds: [f64; 4],
    point: [f64; 2],
    zoom: f64,
}

impl LoupeFrame {
    fn validate(self) -> Result<(), String> {
        let [left, top, right, bottom] = self.bounds;
        let [x, y] = self.point;
        if (0.0..=1.0).contains(&left)
            && (0.0..=1.0).contains(&top)
            && (0.0..=1.0).contains(&right)
            && (0.0..=1.0).contains(&bottom)
            && left < right
            && top < bottom
            && (left..=right).contains(&x)
            && (top..=bottom).contains(&y)
            && (1.5..=5.0).contains(&self.zoom)
        {
            Ok(())
        } else {
            Err("invalid video loupe coordinates".into())
        }
    }
}

#[derive(Deserialize)]
#[serde(tag = "mode", rename_all = "lowercase", deny_unknown_fields)]
pub enum LoupeUpdate {
    Native { frame: LoupeFrame },
    Shader { frame: LoupeFrame },
    HideNative,
    HideShader,
}

fn check_window(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == PLAYER_WINDOW_LABEL {
        Ok(())
    } else {
        Err("video loupe is available only in the player window".into())
    }
}

#[tauri::command]
pub async fn player_loupe_bounds(window: WebviewWindow) -> Result<Option<[f64; 4]>, String> {
    check_window(&window)?;
    on_player(window.app_handle().clone(), |app| {
        let backend = core(&app);
        let dimension = |field| {
            backend
                .get_property(
                    &format!("osd-dimensions/{field}"),
                    "int64",
                    PLAYER_WINDOW_LABEL,
                )
                .ok()?
                .as_f64()
        };
        Ok((|| {
            let w = dimension("w")?;
            let h = dimension("h")?;
            if w <= 0.0 || h <= 0.0 {
                return None;
            }
            let left = (dimension("ml")? / w).clamp(0.0, 1.0);
            let top = (dimension("mt")? / h).clamp(0.0, 1.0);
            let right = (1.0 - dimension("mr")? / w).clamp(0.0, 1.0);
            let bottom = (1.0 - dimension("mb")? / h).clamp(0.0, 1.0);
            (left < right && top < bottom).then_some([left, top, right, bottom])
        })())
    })
    .await
}

#[tauri::command]
pub async fn player_loupe(window: WebviewWindow, update: LoupeUpdate) -> Result<bool, String> {
    check_window(&window)?;
    match update {
        LoupeUpdate::Native { frame } => {
            frame.validate()?;
            #[cfg(windows)]
            return native::update(window, Some(frame)).await;
            #[cfg(not(windows))]
            Err("the native video loupe requires Windows".into())
        }
        LoupeUpdate::HideNative => {
            #[cfg(windows)]
            return native::update(window, None).await;
            #[cfg(not(windows))]
            Ok(false)
        }
        LoupeUpdate::Shader { frame } => {
            frame.validate()?;
            update_shader(window, Some(frame)).await
        }
        LoupeUpdate::HideShader => update_shader(window, None).await,
    }
}

async fn update_shader(window: WebviewWindow, frame: Option<LoupeFrame>) -> Result<bool, String> {
    let size = window.inner_size().map_err(|err| err.to_string())?;
    let scale = window.scale_factor().map_err(|err| err.to_string())?;
    on_player(window.app_handle().clone(), move |app| {
        let host = app.state::<PlayerHost>();
        let instance = host.instance_id.load(Ordering::Acquire);
        if instance == 0 {
            return Ok(false);
        }
        let installed = host.loupe_shader_instance.load(Ordering::Relaxed) == instance;
        let backend = core(&app);
        let command = |name, args: &[serde_json::Value]| backend.command(name, args, PLAYER_WINDOW_LABEL);
        let Some(frame) = frame else {
            if installed {
                let path = super::commands::player_shader_path(app.clone(), "loupe".into())?;
                command("change-list", &[json!("glsl-shaders"), json!("remove"), json!(path)])?;
                host.loupe_shader_instance.store(0, Ordering::Relaxed);
            }
            return Ok(false);
        };
        if !host.is_active() || size.width == 0 || size.height == 0 {
            return Ok(false);
        }
        let [left, top, right, bottom] = frame.bounds;
        let [x, y] = frame.point;
        let width = f64::from(size.width) * (right - left);
        let height = f64::from(size.height) * (bottom - top);
        if width < 8.0 || height < 8.0 {
            return Ok(false);
        }
        let radius = (120.0 * scale).min(width / 2.0).min(height / 2.0);
        let sx = (x - left) / (right - left);
        let sy = (y - top) / (bottom - top);
        let rx = radius / width;
        let ry = radius / height;
        let cx = sx.clamp(rx, 1.0 - rx);
        let cy = sy.clamp(ry, 1.0 - ry);
        let opts = format!("loupe/cx={cx:.6},loupe/cy={cy:.6},loupe/sx={sx:.6},loupe/sy={sy:.6},loupe/radius={rx:.6},loupe/zoom={:.2}", frame.zoom);
        command("change-list", &[json!("glsl-shader-opts"), json!("add"), json!(opts)])?;
        if !installed {
            let path = super::commands::player_shader_path(app.clone(), "loupe".into())?;
            command("change-list", &[json!("glsl-shaders"), json!("append"), json!(path)])?;
            host.loupe_shader_instance.store(instance, Ordering::Relaxed);
        }
        Ok(true)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_points_in_bars_and_zoom_outside_the_supported_range() {
        let valid = LoupeFrame {
            bounds: [0.0, 0.1, 1.0, 0.9],
            point: [0.5, 0.5],
            zoom: 2.0,
        };
        assert!(valid.validate().is_ok());
        assert!(LoupeFrame {
            point: [0.5, 0.05],
            ..valid
        }
        .validate()
        .is_err());
        assert!(LoupeFrame {
            bounds: [0.0, 0.9, 1.0, 0.1],
            ..valid
        }
        .validate()
        .is_err());
        assert!(LoupeFrame { zoom: 5.5, ..valid }.validate().is_err());
        assert!(LoupeFrame {
            point: [f64::NAN, 0.5],
            ..valid
        }
        .validate()
        .is_err());
    }
}
