use tauri::{Emitter, Manager};

pub const SCHEME: &str = "iluhaanime";
pub const EVENT: &str = "deep-link-opened";

fn scheme_prefix() -> String {
    format!("{SCHEME}://")
}

pub struct PendingLinks(pub std::sync::Mutex<Vec<String>>);

impl PendingLinks {
    fn drain(&self) -> Result<Vec<String>, String> {
        self.0
            .lock()
            .map(|mut guard| std::mem::take(&mut *guard))
            .map_err(|error| format!("{error}"))
    }

    fn push(&self, urls: Vec<String>) {
        if let Ok(mut guard) = self.0.lock() {
            guard.extend(urls);
        }
    }
}

pub fn extract_deep_link_urls(args: impl Iterator<Item = String>) -> Vec<String> {
    let prefix = scheme_prefix();
    args.filter(|arg| arg.to_lowercase().starts_with(&prefix))
        .collect()
}

fn focus_main(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

pub fn handle_second_instance(app: &tauri::AppHandle, args: Vec<String>) {
    let urls = extract_deep_link_urls(args.into_iter());
    if urls.is_empty() {
        focus_main(app);
        return;
    }
    if let Some(state) = app.try_state::<PendingLinks>() {
        state.push(urls.clone());
    }
    let _ = app.emit(EVENT, &urls);
    focus_main(app);
}

#[tauri::command]
pub fn take_pending_deep_links(
    state: tauri::State<'_, PendingLinks>,
) -> Result<Vec<String>, String> {
    state.drain()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(items: &[&str]) -> Vec<String> {
        items.iter().map(std::string::ToString::to_string).collect()
    }

    #[test]
    fn keeps_only_scheme_urls_in_order() {
        let out = extract_deep_link_urls(
            args(&[
                "C:\\Program Files\\iluhaAnime\\iluhaAnime.exe",
                "iluhaanime://anime/anilist/21",
                "--flag",
                "iluhaanime://anime/anilist/5114",
                "https://anilist.co/anime/21",
            ])
            .into_iter(),
        );
        assert_eq!(
            out,
            vec![
                "iluhaanime://anime/anilist/21".to_string(),
                "iluhaanime://anime/anilist/5114".to_string(),
            ]
        );
    }

    #[test]
    fn matches_scheme_case_insensitively() {
        let out = extract_deep_link_urls(args(&["ILUHAANIME://anime/anilist/21"]).into_iter());
        assert_eq!(out, vec!["ILUHAANIME://anime/anilist/21".to_string()]);
    }

    #[test]
    fn drain_takes_and_clears() {
        let state = PendingLinks(std::sync::Mutex::new(vec!["a".to_string()]));
        assert_eq!(state.drain().unwrap(), vec!["a".to_string()]);
        assert!(state.drain().unwrap().is_empty());
    }
}
