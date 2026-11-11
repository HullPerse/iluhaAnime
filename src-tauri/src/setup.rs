use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;

pub fn with_plugins(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    builder
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            crate::deeplink::handle_second_instance(app, args);
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::all()
                        & !tauri_plugin_window_state::StateFlags::DECORATIONS
                        & !tauri_plugin_window_state::StateFlags::VISIBLE,
                )
                .build(),
        )
        .plugin(tauri_plugin_libmpv::init())
}

pub fn install_tray(app: &tauri::AppHandle) {
    let tray_icon = app.default_window_icon().cloned().or_else(|| {
        tauri::image::Image::from_bytes(include_bytes!("../icons/32x32.png")).ok()
    });
    match tray_icon {
        Some(icon) => {
            if let Err(error) = TrayIconBuilder::with_id("iluhaanime-tray")
                .icon(icon)
                .tooltip("iluhaAnime")
                .on_tray_icon_event(|tray, event| {
                    let restore = matches!(
                        event,
                        TrayIconEvent::Click {
                            button: MouseButton::Left,
                            ..
                        } | TrayIconEvent::DoubleClick {
                            button: MouseButton::Left,
                            ..
                        }
                    );
                    if !restore {
                        return;
                    }
                    if let Some(window) = tray.app_handle().get_webview_window("main") {
                        let _ = window.unminimize();
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                })
                .build(app)
            {
                tracing::warn!("unable to create the tray icon: {error}");
            }
        }
        None => {
            tracing::warn!("tray icon unavailable: no window icon and bundled icon failed");
        }
    }
}
