//! Startup phase timings.
//!
//! Records how long the native boot path takes between process start and the
//! moment the shell is interactive, so optimizations are measured instead of
//! assumed. Marks are cheap (`Instant::elapsed` plus a push) and are reported
//! once in `setup`, together with the frontend marks the webview sends back.

use std::io::Write;
use std::sync::{Mutex, OnceLock};
use std::time::Instant;

use tauri::Manager;

static START: OnceLock<Instant> = OnceLock::new();
static MARKS: OnceLock<Mutex<Vec<(&'static str, f64)>>> = OnceLock::new();

#[derive(Debug, Clone, serde::Deserialize)]
pub struct FrontendMark {
    pub label: String,
    pub ms: f64,
}

/// Starts the clock. Safe to call more than once: the first call wins, so the
/// binary can call it before `run()` while tests still get a valid origin.
pub fn begin() {
    let _ = START.set(Instant::now());
}

/// Records a phase boundary relative to [`begin`]. Does nothing when the clock
/// was never started, which keeps unit tests free of ordering requirements.
pub fn mark(label: &'static str) {
    let Some(start) = START.get() else {
        return;
    };
    let elapsed_ms = start.elapsed().as_secs_f64() * 1000.0;
    crate::sync_utils::lock_or_recover(
        MARKS.get_or_init(|| Mutex::new(Vec::new())),
        "startup marks",
    )
    .push((label, elapsed_ms));
}

/// Returns the recorded phases in order. A repeated label is kept as-is: the
/// call order is the timeline.
pub fn marks() -> Vec<(&'static str, f64)> {
    MARKS
        .get()
        .map(|marks| crate::sync_utils::lock_or_recover(marks, "startup marks").clone())
        .unwrap_or_default()
}

/// Writes the native timeline to the log. One line per phase keeps it greppable
/// in the app log and cheap to parse from a script.
pub fn log_report() {
    for (label, elapsed_ms) in marks() {
        tracing::info!("[STARTUP] {label} {elapsed_ms:.1}ms");
    }
}

/// Appends the timeline to `<app data>/startup.log` as well as the log stream.
/// A packaged Windows build has no console, so the file is the only place a
/// release startup measurement survives.
fn append_to_file(app: &tauri::AppHandle, lines: &[String]) {
    let Ok(dir) = app.path().app_data_dir() else {
        return;
    };
    if std::fs::create_dir_all(&dir).is_err() {
        return;
    }
    let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("startup.log"))
    else {
        return;
    };
    for line in lines {
        let _ = writeln!(file, "{line}");
    }
}

/// Writes the native timeline once setup is done. The file must not depend on
/// the webview calling back: a boot that dies before the first paint still
/// needs its timings.
pub fn flush(app: &tauri::AppHandle) {
    let lines: Vec<String> = marks()
        .into_iter()
        .map(|(label, elapsed_ms)| format!("[STARTUP] {label} {elapsed_ms:.1}ms"))
        .collect();
    append_to_file(app, &lines);
}

/// Absorbs the webview timeline into the same log so both halves line up on
/// one clock: `fe:` marks are relative to the webview's own performance origin.
#[tauri::command]
pub fn report_startup(app: tauri::AppHandle, marks: Vec<FrontendMark>) {
    let mut lines = Vec::with_capacity(marks.len());
    for mark in &marks {
        tracing::info!("[STARTUP] fe_{} {:.1}ms", mark.label, mark.ms);
        lines.push(format!("[STARTUP] fe_{} {:.1}ms", mark.label, mark.ms));
    }
    append_to_file(&app, &lines);
    log_report();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn marks_are_recorded_in_call_order() {
        begin();
        mark("first");
        mark("second");

        let recorded = marks();
        assert!(recorded.len() >= 2);
        let tail = &recorded[recorded.len() - 2..];
        assert_eq!(tail[0].0, "first");
        assert_eq!(tail[1].0, "second");
        assert!(tail[1].1 >= tail[0].1);
    }

    #[test]
    fn report_marks_are_deserializable() {
        let parsed: FrontendMark = serde_json::from_str(r#"{"label":"mount","ms":12.5}"#)
            .expect("frontend mark shape");
        assert_eq!(parsed.label, "mount");
        assert!((parsed.ms - 12.5).abs() < f64::EPSILON);
    }
}
