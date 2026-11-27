use std::cell::RefCell;

use tauri::WebviewWindow;
use windows::core::{w, Error, Result};
use windows::Win32::Foundation::{HWND, POINT, RECT};
use windows::Win32::Graphics::Gdi::{
    ClientToScreen, CreateEllipticRgn, DeleteObject, InvalidateRect, SetWindowRgn,
};
use windows::Win32::UI::HiDpi::GetDpiForWindow;
use windows::Win32::UI::Magnification::{
    MagInitialize, MagSetWindowFilterList, MagSetWindowSource, MagSetWindowTransform,
    MagUninitialize, MAGTRANSFORM, MW_FILTERMODE_EXCLUDE, WC_MAGNIFIERW,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DestroyWindow, GetAncestor, GetClientRect, GetForegroundWindow, KillTimer,
    SetLayeredWindowAttributes, SetTimer, SetWindowPos, WindowFromPoint, GA_ROOT, HWND_TOPMOST,
    LWA_ALPHA, SWP_NOACTIVATE, SWP_NOZORDER, SWP_SHOWWINDOW, WINDOW_EX_STYLE, WINDOW_STYLE,
    WS_CHILD, WS_CLIPCHILDREN, WS_EX_LAYERED, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
    WS_EX_TRANSPARENT, WS_POPUP, WS_VISIBLE,
};

use super::LoupeFrame;

thread_local! {
    static LENS: RefCell<Option<NativeLoupe>> = const { RefCell::new(None) };
}

struct NativeLoupe {
    owner: HWND,
    popup: HWND,
    magnifier: HWND,
    timer: usize,
    origin: POINT,
    client: RECT,
    source: RECT,
    diameter: i32,
    zoom: f64,
}

impl NativeLoupe {
    fn new(owner: HWND) -> Result<Self> {
        // The native window and the magnifier runtime are owned by the UI thread.
        unsafe {
            MagInitialize().ok()?;
            let mut lens = Self {
                owner,
                popup: HWND::default(),
                magnifier: HWND::default(),
                timer: 0,
                origin: POINT::default(),
                client: RECT::default(),
                source: RECT::default(),
                diameter: 0,
                zoom: 0.0,
            };
            lens.popup = CreateWindowExW(
                WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW,
                w!("STATIC"),
                w!("iluhaAnime video loupe"),
                WS_POPUP | WS_CLIPCHILDREN | WINDOW_STYLE(6), // SS_WHITERECT
                0,
                0,
                0,
                0,
                Some(owner),
                None,
                None,
                None,
            )?;
            SetLayeredWindowAttributes(lens.popup, Default::default(), 255, LWA_ALPHA)?;
            lens.magnifier = CreateWindowExW(
                WINDOW_EX_STYLE(0),
                WC_MAGNIFIERW,
                w!(""),
                WS_CHILD | WS_VISIBLE,
                0,
                0,
                0,
                0,
                Some(lens.popup),
                None,
                None,
                None,
            )?;
            let mut excluded = lens.popup;
            MagSetWindowFilterList(lens.magnifier, MW_FILTERMODE_EXCLUDE, 1, &mut excluded).ok()?;
            lens.timer = SetTimer(Some(lens.popup), 1, 16, Some(refresh_loupe));
            if lens.timer == 0 {
                return Err(Error::from_thread());
            }
            Ok(lens)
        }
    }

    fn set_frame(&mut self, frame: LoupeFrame) -> Result<bool> {
        let [left, top, right, bottom] = frame.bounds;
        let [x, y] = frame.point;
        let (origin, client) = client_bounds(self.owner)?;
        self.origin = origin;
        self.client = client;
        let screen_x = |value: f64| origin.x + (f64::from(client.right) * value).round() as i32;
        let screen_y = |value: f64| origin.y + (f64::from(client.bottom) * value).round() as i32;
        let (left, top, right, bottom) = (
            screen_x(left),
            screen_y(top),
            screen_x(right),
            screen_y(bottom),
        );
        let (x, y) = (screen_x(x), screen_y(y));
        let dpi = f64::from(unsafe { GetDpiForWindow(self.owner) });
        let diameter = ((240.0 * dpi / 96.0).round() as i32)
            .min(right - left)
            .min(bottom - top);
        if diameter < 8 {
            return Ok(false);
        }
        let sample = (f64::from(diameter - 4) / frame.zoom).round().max(1.0) as i32;
        let source_x = (x - sample / 2).clamp(left, right - sample);
        let source_y = (y - sample / 2).clamp(top, bottom - sample);
        self.source = RECT {
            left: source_x,
            top: source_y,
            right: source_x + sample,
            bottom: source_y + sample,
        };
        if !self.source_is_visible() {
            return Ok(false);
        }
        unsafe {
            if self.diameter != diameter {
                apply_region(self.popup, CreateEllipticRgn(0, 0, diameter, diameter))?;
                apply_region(
                    self.magnifier,
                    CreateEllipticRgn(0, 0, diameter - 4, diameter - 4),
                )?;
                SetWindowPos(
                    self.magnifier,
                    None,
                    2,
                    2,
                    diameter - 4,
                    diameter - 4,
                    SWP_NOACTIVATE | SWP_NOZORDER,
                )?;
                self.diameter = diameter;
            }
            if self.zoom != frame.zoom {
                let zoom = frame.zoom as f32;
                let mut transform = MAGTRANSFORM {
                    v: [zoom, 0.0, 0.0, 0.0, zoom, 0.0, 0.0, 0.0, 1.0],
                };
                MagSetWindowTransform(self.magnifier, &mut transform).ok()?;
                self.zoom = frame.zoom;
            }
            self.refresh()?;
            let popup_x = (x - diameter / 2).clamp(left, right - diameter);
            let popup_y = (y - diameter / 2).clamp(top, bottom - diameter);
            SetWindowPos(
                self.popup,
                Some(HWND_TOPMOST),
                popup_x,
                popup_y,
                diameter,
                diameter,
                SWP_NOACTIVATE | SWP_SHOWWINDOW,
            )?;
        }
        Ok(true)
    }

    fn source_is_visible(&self) -> bool {
        if unsafe { GetForegroundWindow() } != self.owner {
            return false;
        }
        let RECT {
            left,
            top,
            right,
            bottom,
        } = self.source;
        [
            (left, top),
            (left, bottom - 1),
            (right - 1, top),
            (right - 1, bottom - 1),
            ((left + right) / 2, (top + bottom) / 2),
        ]
        .into_iter()
        .all(|(x, y)| unsafe {
            let root = GetAncestor(WindowFromPoint(POINT { x, y }), GA_ROOT);
            root == self.owner || root == self.popup
        })
    }

    fn refresh(&self) -> Result<()> {
        unsafe {
            MagSetWindowSource(self.magnifier, self.source).ok()?;
            let _ = InvalidateRect(Some(self.magnifier), None, false);
        }
        Ok(())
    }
}

impl Drop for NativeLoupe {
    fn drop(&mut self) {
        unsafe {
            if self.timer != 0 {
                let _ = KillTimer(Some(self.popup), self.timer);
            }
            if !self.popup.is_invalid() {
                let _ = DestroyWindow(self.popup);
            }
            let _ = MagUninitialize();
        }
    }
}

fn apply_region(hwnd: HWND, region: windows::Win32::Graphics::Gdi::HRGN) -> Result<()> {
    unsafe {
        if !region.is_invalid() && SetWindowRgn(hwnd, Some(region), true) != 0 {
            return Ok(());
        }
        let error = Error::from_thread();
        let _ = DeleteObject(region.into());
        Err(error)
    }
}

fn client_bounds(owner: HWND) -> Result<(POINT, RECT)> {
    let mut origin = POINT::default();
    let mut rect = RECT::default();
    unsafe {
        GetClientRect(owner, &mut rect)?;
        ClientToScreen(owner, &mut origin).ok()?;
    }
    Ok((origin, rect))
}

unsafe extern "system" fn refresh_loupe(hwnd: HWND, _: u32, _: usize, _: u32) {
    LENS.with(|slot| {
        let Ok(mut slot) = slot.try_borrow_mut() else {
            return;
        };
        if let Some(lens) = slot.as_ref().filter(|lens| lens.popup == hwnd) {
            let current_bounds = client_bounds(lens.owner).ok();
            if current_bounds != Some((lens.origin, lens.client))
                || !lens.source_is_visible()
                || lens.refresh().is_err()
            {
                slot.take();
            }
        }
    });
}

pub(in crate::player) fn clear() {
    LENS.with(|slot| {
        if let Ok(mut slot) = slot.try_borrow_mut() {
            slot.take();
        }
    });
}

pub(super) async fn update(
    window: WebviewWindow,
    frame: Option<LoupeFrame>,
) -> std::result::Result<bool, String> {
    let (send, receive) = tokio::sync::oneshot::channel();
    let player = window.clone();
    window
        .run_on_main_thread(move || {
            let result = (|| -> std::result::Result<bool, String> {
                let Some(frame) = frame else {
                    clear();
                    return Ok(false);
                };
                let owner = player.hwnd().map_err(|error| error.to_string())?;
                if unsafe { GetForegroundWindow() } != owner {
                    clear();
                    return Ok(false);
                }
                LENS.with(|slot| {
                    let mut slot = slot.borrow_mut();
                    if slot.as_ref().is_some_and(|lens| lens.owner != owner) {
                        slot.take();
                    }
                    if slot.is_none() {
                        *slot = Some(NativeLoupe::new(owner).map_err(|error| error.to_string())?);
                    }
                    let result = slot
                        .as_mut()
                        .expect("loupe was initialized")
                        .set_frame(frame);
                    if !matches!(result, Ok(true)) {
                        slot.take();
                    }
                    result.map_err(|error| error.to_string())
                })
            })();
            let _ = send.send(result);
        })
        .map_err(|error| error.to_string())?;
    receive.await.map_err(|error| error.to_string())?
}
