//! Secret game tab backend: CHIP-8 sessions plus the ROM library.
//!
//! One game session at a time. The frontend owns the clock: every animation
//! frame it calls `game_tick` with the number of cycles and 60 Hz timer ticks
//! that elapsed, and gets back a packed framebuffer with a small flag header.
//! A hidden or closed tab therefore costs zero CPU.

pub mod chip8;
pub mod roms;
pub mod store;

use serde::Serialize;
use std::sync::{Mutex, MutexGuard};

use chip8::{Chip8, Quirks};

/// `game_tick` response layout: 4 header bytes, an optional 18-byte XO-CHIP
/// audio block (present exactly when [`FLAG_XO`] is set), then the packed
/// framebuffer: one bit per pixel, or two for XO-CHIP colour indices.
pub const HEADER_BYTES: usize = 4;
pub const FLAG_DIRTY: u8 = 0x01;
pub const FLAG_HIRES: u8 = 0x02;
pub const FLAG_SOUND: u8 = 0x04;
pub const FLAG_WAIT_KEY: u8 = 0x08;
pub const FLAG_HALTED: u8 = 0x10;
/// The session runs an XO-CHIP program: the frame uses two bits per pixel
/// and carries the audio block.
pub const FLAG_XO: u8 = 0x20;
/// `pitch rate u16` plus the 16 pattern bytes of the XO-CHIP audio block.
pub const XO_AUDIO_BYTES: usize = 18;

/// Fallback pace for ROMs the store index does not know: cycles the
/// frontend asks for per second. Archive entries play at their recorded
/// `tickrate` (cycles per 60 Hz frame) instead.
pub const CYCLES_PER_SECOND_CHIP8: u32 = 720;
pub const CYCLES_PER_SECOND_SCHIP: u32 = 1200;

/// Cycles per second for one session: the archive `tickrate` when the bytes
/// are in the index, otherwise the platform fallback.
fn cycles_per_second(platform: &str, tickrate: Option<u32>) -> u32 {
    if let Some(tickrate) = tickrate {
        return tickrate.saturating_mul(60);
    }
    if platform == "chip8" {
        CYCLES_PER_SECOND_CHIP8
    } else {
        CYCLES_PER_SECOND_SCHIP
    }
}

/// Hard cap per `game_tick` call so a background tab that wakes with a huge
/// elapsed time cannot stall the UI thread with an unbounded burst. The
/// archive's fastest ROMs run at a `tickrate` of 10000 cycles per 60 Hz
/// frame, so the cap sits above that plus carry headroom.
const MAX_CYCLES_PER_TICK: u32 = 12_000;
const MAX_TIMER_TICKS_PER_TICK: u32 = 32;

#[derive(Default)]
pub struct GameHost {
    inner: Mutex<GameHostInner>,
}

#[derive(Default)]
struct GameHostInner {
    next_id: u64,
    session: Option<GameSession>,
}

struct GameSession {
    id: u64,
    vm: Chip8,
    frame: Vec<u8>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameStartInfo {
    pub session: u64,
    pub id: String,
    pub name: String,
    pub platform: String,
    pub author: Option<String>,
    pub license: Option<String>,
    /// Controls hint matched against the store index; `None` when unknown.
    pub howto: Option<String>,
    pub cols: usize,
    pub rows: usize,
    /// Cycles per second this session should be fed: the archive `tickrate`
    /// when known, otherwise the platform pace.
    pub cycles_per_second: u32,
    /// XO-CHIP four-colour palette (background, plane 1, plane 2, overlap)
    /// for sessions that render two bitplanes; `None` keeps the theme.
    pub palette: Option<store::Palette>,
}

fn lock_host<'a>(
    host: &'a tauri::State<'_, GameHost>,
) -> Result<MutexGuard<'a, GameHostInner>, String> {
    host.inner
        .lock()
        .map_err(|error| format!("game session lock: {error}"))
}

fn install_session(inner: &mut GameHostInner, vm: Chip8) -> u64 {
    inner.next_id += 1;
    let session = inner.next_id;
    inner.session = Some(GameSession {
        id: session,
        vm,
        frame: Vec::new(),
    });
    session
}

fn with_session<T>(
    inner: &mut GameHostInner,
    session: u64,
    use_session: impl FnOnce(&mut GameSession) -> T,
) -> Result<T, String> {
    let active = inner
        .session
        .as_mut()
        .ok_or_else(|| "no active game session".to_string())?;
    if active.id != session {
        return Err("stale game session".to_string());
    }
    Ok(use_session(active))
}

fn run_tick(
    inner: &mut GameHostInner,
    session: u64,
    cycles: u32,
    timers: u32,
) -> Result<Vec<u8>, String> {
    with_session(inner, session, |active| {
        let GameSession { vm, frame, .. } = active;
        for _ in 0..cycles.min(MAX_CYCLES_PER_TICK) {
            if vm.tick() {
                // DISP.WAIT: the draw ended this frame's cycle budget.
                break;
            }
        }
        vm.tick_timers(timers.min(MAX_TIMER_TICKS_PER_TICK));

        let mut flags = 0u8;
        if vm.dirty {
            flags |= FLAG_DIRTY;
        }
        if vm.hires {
            flags |= FLAG_HIRES;
        }
        if vm.sound_active() {
            flags |= FLAG_SOUND;
        }
        if vm.waiting_for_key() {
            flags |= FLAG_WAIT_KEY;
        }
        if vm.halted {
            flags |= FLAG_HALTED;
        }
        if vm.quirks.xochip {
            flags |= FLAG_XO;
        }

        let audio_bytes = if vm.quirks.xochip { XO_AUDIO_BYTES } else { 0 };
        let mut out = Vec::with_capacity(HEADER_BYTES + audio_bytes + vm.frame_len());
        out.extend_from_slice(&[flags, 0, 0, 0]);
        if vm.quirks.xochip {
            // XO-CHIP audio block: the pitch rate in hertz, then the 128
            // one-bit samples of the pattern buffer.
            out.extend_from_slice(&vm.pitch_rate().to_le_bytes());
            out.extend_from_slice(&vm.pattern);
        }
        vm.pack_frame(frame);
        out.extend_from_slice(frame);
        vm.dirty = false;
        out
    })
}

#[tauri::command]
pub fn game_start(
    app: tauri::AppHandle,
    host: tauri::State<'_, GameHost>,
    id: String,
) -> Result<GameStartInfo, String> {
    let (bytes, info) = roms::load_rom_for_start(&app, &id)?;
    let howto = store::hint_for_bytes(&bytes)?;
    // Archive ROMs carry their own Octo quirk flags; anything else falls back
    // to the platform profile.
    let quirks =
        store::quirks_for_bytes(&bytes).unwrap_or_else(|| Quirks::for_platform(&info.platform));
    let palette = if quirks.xochip {
        Some(store::palette_for_bytes(&bytes)?)
    } else {
        None
    };
    let mut vm = Chip8::new(quirks);
    vm.load(&bytes)?;
    let cycles_per_second = cycles_per_second(&info.platform, store::tickrate_for_bytes(&bytes));
    let cols = vm.cols();
    let rows = vm.rows();
    let session = {
        let mut inner = lock_host(&host)?;
        install_session(&mut inner, vm)
    };
    Ok(GameStartInfo {
        session,
        id: info.id,
        name: info.name,
        platform: info.platform,
        author: info.author,
        license: info.license,
        howto,
        cols,
        rows,
        cycles_per_second,
        palette,
    })
}

#[tauri::command]
pub fn game_tick(
    host: tauri::State<'_, GameHost>,
    session: u64,
    cycles: u32,
    timers: u32,
) -> Result<tauri::ipc::Response, String> {
    let mut inner = lock_host(&host)?;
    Ok(tauri::ipc::Response::new(run_tick(
        &mut inner, session, cycles, timers,
    )?))
}

#[tauri::command]
pub fn game_key(
    host: tauri::State<'_, GameHost>,
    session: u64,
    key: u8,
    pressed: bool,
) -> Result<(), String> {
    let mut inner = lock_host(&host)?;
    with_session(&mut inner, session, |active| {
        active.vm.set_key(key, pressed);
    })
}

fn drop_session(inner: &mut GameHostInner, session: u64) {
    if inner
        .session
        .as_ref()
        .is_some_and(|active| active.id == session)
    {
        inner.session = None;
    }
}

#[tauri::command]
pub fn game_stop(host: tauri::State<'_, GameHost>, session: u64) -> Result<(), String> {
    let mut inner = lock_host(&host)?;
    drop_session(&mut inner, session);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn installed(rom: &[u8]) -> (GameHost, u64) {
        let host = GameHost::default();
        let mut inner = host.inner.lock().expect("lock");
        let mut vm = Chip8::new(Quirks::CHIP8);
        vm.load(rom).expect("load");
        let session = install_session(&mut inner, vm);
        drop(inner);
        (host, session)
    }

    fn tick_once(
        host: &GameHost,
        session: u64,
        cycles: u32,
        timers: u32,
    ) -> Result<Vec<u8>, String> {
        run_tick(
            &mut host.inner.lock().expect("lock"),
            session,
            cycles,
            timers,
        )
    }

    #[test]
    fn tick_returns_header_and_low_res_frame() {
        let (host, session) = installed(&[0xD0, 0x11, 0x60, 0x0A]);
        {
            let mut inner = host.inner.lock().expect("lock");
            inner.session.as_mut().expect("session").vm.i = 0x200;
        }
        let out = tick_once(&host, session, 1, 0).expect("tick");
        assert_eq!(out.len(), HEADER_BYTES + 32 * 64 / 8);
        assert_ne!(out[0] & FLAG_DIRTY, 0, "draw must mark the frame dirty");
        assert_eq!(out[0] & FLAG_HIRES, 0);
        let out = tick_once(&host, session, 1, 0).expect("tick");
        assert_eq!(out[0] & FLAG_DIRTY, 0, "clean frames must not redraw");
        assert!(
            out[HEADER_BYTES..].iter().any(|byte| *byte != 0),
            "the sprite must be visible in the frame"
        );
    }

    #[test]
    fn xo_tick_carries_audio_and_two_bit_frame() {
        let host = GameHost::default();
        let mut inner = host.inner.lock().expect("lock");
        let mut vm = Chip8::new(Quirks::XO_CHIP);
        // V0 = 64 then FX3A: the pitch register selects the 4000 Hz default.
        vm.load(&[0x60, 0x40, 0xF0, 0x3A]).expect("load");
        let session = install_session(&mut inner, vm);
        drop(inner);
        let out = tick_once(&host, session, 2, 0).expect("tick");
        assert_ne!(out[0] & FLAG_XO, 0, "XO sessions must flag the frame");
        assert_eq!(out.len(), HEADER_BYTES + XO_AUDIO_BYTES + 32 * 64 / 4);
        assert_eq!(
            u16::from_le_bytes([out[HEADER_BYTES], out[HEADER_BYTES + 1]]),
            4000,
            "the audio block carries the pitch rate"
        );
        assert_eq!(
            &out[HEADER_BYTES + 2..HEADER_BYTES + XO_AUDIO_BYTES],
            &[0_u8; 16][..],
            "the pattern buffer starts silent"
        );
    }

    #[test]
    fn tick_rejects_stale_sessions() {
        let (host, session) = installed(&[0x00, 0xE0]);
        assert!(tick_once(&host, session + 1, 1, 0).is_err());
        assert!(tick_once(&host, session, 1, 0).is_ok());
    }

    #[test]
    fn key_release_completes_wait_and_advances() {
        let (host, session) = installed(&[0xF0, 0x0A, 0x61, 0x02]);
        let out = tick_once(&host, session, 4, 0).expect("tick");
        assert_ne!(out[0] & FLAG_WAIT_KEY, 0, "FX0A must park the VM");
        {
            let mut inner = host.inner.lock().expect("lock");
            with_session(&mut inner, session, |active| {
                active.vm.set_key(7, true);
                assert_eq!(active.vm.v[0], 0, "the press alone must not resume");
                active.vm.set_key(7, false);
                assert_eq!(active.vm.v[0], 7, "the release reaches the register");
            })
            .expect("session");
        }
        let out = tick_once(&host, session, 4, 0).expect("tick");
        assert_eq!(out[0] & FLAG_WAIT_KEY, 0, "the key must release the VM");
    }

    #[test]
    fn key_rejects_stale_sessions() {
        let (host, session) = installed(&[0x00, 0xE0]);
        let mut inner = host.inner.lock().expect("lock");
        assert!(with_session(&mut inner, session + 1, |_| ()).is_err());
        assert!(with_session(&mut inner, session, |_| ()).is_ok());
    }

    #[test]
    fn cycles_and_timers_are_capped() {
        // An endless loop program: the cap must stop the burst deterministically.
        let (host, session) = installed(&[0x12, 0x00]);
        let out = tick_once(&host, session, 1_000_000, 1_000_000).expect("tick");
        assert_eq!(out.len(), HEADER_BYTES + 32 * 64 / 8);
        let cycles = host
            .inner
            .lock()
            .expect("lock")
            .session
            .as_ref()
            .expect("session")
            .vm
            .cycles();
        assert_eq!(cycles, u64::from(MAX_CYCLES_PER_TICK));
    }

    #[test]
    fn sound_flag_tracks_the_sound_timer() {
        let (host, session) = installed(&[0x6A, 0x05, 0xFA, 0x18]);
        let out = tick_once(&host, session, 2, 0).expect("tick");
        assert_ne!(out[0] & FLAG_SOUND, 0);
        let out = tick_once(&host, session, 1, 5).expect("tick");
        assert_eq!(out[0] & FLAG_SOUND, 0, "the timer must run down");
    }

    #[test]
    fn stop_forgets_the_session() {
        let (host, session) = installed(&[0x00, 0xE0]);
        {
            let mut inner = host.inner.lock().expect("lock");
            drop_session(&mut inner, session);
        }
        assert!(tick_once(&host, session, 1, 0).is_err());
        // A stop for another session must not drop the active one.
        let (host, session) = installed(&[0x00, 0xE0]);
        {
            let mut inner = host.inner.lock().expect("lock");
            drop_session(&mut inner, session + 1);
        }
        assert!(tick_once(&host, session, 1, 0).is_ok());
    }

    #[test]
    fn cycles_per_second_prefers_the_archive_tickrate() {
        assert_eq!(cycles_per_second("schip", Some(15)), 900);
        assert_eq!(cycles_per_second("chip8", Some(1000)), 60_000);
        assert_eq!(cycles_per_second("chip8", None), CYCLES_PER_SECOND_CHIP8);
        assert_eq!(cycles_per_second("schip", None), CYCLES_PER_SECOND_SCHIP);
    }

    #[test]
    fn vblank_wait_draw_ends_the_tick_batch() {
        let host = GameHost::default();
        let mut inner = host.inner.lock().expect("lock");
        let mut vm = Chip8::new(Quirks::CHIP8);
        vm.load(&[0xD0, 0x11, 0x12, 0x00]).expect("load");
        vm.i = 0x200;
        let session = install_session(&mut inner, vm);
        drop(inner);
        tick_once(&host, session, 100, 0).expect("tick");
        let cycles = host
            .inner
            .lock()
            .expect("lock")
            .session
            .as_ref()
            .expect("session")
            .vm
            .cycles();
        assert_eq!(cycles, 1, "the VIP draw must consume the rest of the batch");
    }
}
