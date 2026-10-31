//! Quick Panel hotkey by physical key, read from a low-level keyboard hook.
//!
//! RegisterHotKey matches virtual keys, and those depend on the keyboard layout. On a German
//! layout the key that global-hotkey maps to VK_OEM_3 ("Backquote") is not the key left of "1",
//! so Ctrl+Backquote never fired there. The scan code is the same on every layout, so the hook
//! matches that. Keys not in `scan_of` still use RegisterHotKey (see `hotkeys::sync`).

use crate::hotkeys;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use tauri::AppHandle;
use tauri_plugin_global_shortcut::ShortcutState;

/// A hotkey as the hook sees it: scan code, extended-key flag, and exact modifier set.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Spec {
    pub scan: u32,
    pub extended: bool,
    pub ctrl: bool,
    pub alt: bool,
    pub shift: bool,
    pub win: bool,
}

static APP: OnceLock<AppHandle> = OnceLock::new();
static SPEC: Mutex<Option<Spec>> = Mutex::new(None);
/// The main key is down. Set on the first Pressed so auto-repeat is ignored.
static DOWN: AtomicBool = AtomicBool::new(false);

/// Parses "Ctrl+Shift+KeyX". `None` if the key is not one this module knows (use RegisterHotKey).
pub fn spec(hotkey: &str) -> Option<Spec> {
    let mut s = Spec { scan: 0, extended: false, ctrl: false, alt: false, shift: false, win: false };
    let mut key = None;
    for raw in hotkey.split('+') {
        match raw.trim() {
            "Ctrl" => s.ctrl = true,
            "Alt" => s.alt = true,
            "Shift" => s.shift = true,
            "Super" => s.win = true,
            other => key = Some(other),
        }
    }
    let (scan, extended) = scan_of(key?)?;
    s.scan = scan;
    s.extended = extended;
    Some(s)
}

/// Scan codes (set 1) for `KeyboardEvent.code` names. Layout-independent by definition.
fn scan_of(code: &str) -> Option<(u32, bool)> {
    const LETTERS: &str = "QWERTYUIOPASDFGHJKLZXCVBNM";
    const LETTER_SCANS: [u32; 26] = [
        0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, // Q..P
        0x1E, 0x1F, 0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, // A..L
        0x2C, 0x2D, 0x2E, 0x2F, 0x30, 0x31, 0x32, // Z..M
    ];
    if let Some(letter) = code.strip_prefix("Key") {
        let i = LETTERS.find(letter)?;
        return Some((LETTER_SCANS[i], false));
    }
    if let Some(digit) = code.strip_prefix("Digit") {
        return match digit.parse::<u32>() {
            Ok(0) => Some((0x0B, false)),
            Ok(n @ 1..=9) => Some((n + 1, false)), // "1" is scan 0x02
            _ => None,
        };
    }
    if let Some(n) = code.strip_prefix('F').and_then(|n| n.parse::<u32>().ok()) {
        return match n {
            1..=10 => Some((0x3A + n, false)),
            11 => Some((0x57, false)),
            12 => Some((0x58, false)),
            _ => None,
        };
    }
    Some(match code {
        "Backquote" => (0x29, false),
        "Minus" => (0x0C, false),
        "Equal" => (0x0D, false),
        "BracketLeft" => (0x1A, false),
        "BracketRight" => (0x1B, false),
        "Backslash" => (0x2B, false),
        "Semicolon" => (0x27, false),
        "Quote" => (0x28, false),
        "Comma" => (0x33, false),
        "Period" => (0x34, false),
        "Slash" => (0x35, false),
        "Space" => (0x39, false),
        "Tab" => (0x0F, false),
        "Insert" => (0x52, true),
        "Delete" => (0x53, true),
        "Home" => (0x47, true),
        "End" => (0x4F, true),
        "PageUp" => (0x49, true),
        "PageDown" => (0x51, true),
        "ArrowUp" => (0x48, true),
        "ArrowLeft" => (0x4B, true),
        "ArrowRight" => (0x4D, true),
        "ArrowDown" => (0x50, true),
        _ => return None,
    })
}

/// Sets the hotkey the hook watches. `None` turns the hook path off.
pub fn set(spec: Option<Spec>) {
    *SPEC.lock().unwrap() = spec;
    DOWN.store(false, Ordering::SeqCst);
}

/// Installs the hook on its own thread with a message loop. Call once at startup.
#[cfg(windows)]
pub fn start(app: AppHandle) {
    use windows::Win32::Foundation::HINSTANCE;
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::UI::WindowsAndMessaging::{
        GetMessageW, SetWindowsHookExW, MSG, WH_KEYBOARD_LL,
    };
    let _ = APP.set(app);
    std::thread::spawn(|| unsafe {
        let module = GetModuleHandleW(None).ok().map(|m| HINSTANCE(m.0));
        if let Err(e) = SetWindowsHookExW(WH_KEYBOARD_LL, Some(hook_proc), module, 0) {
            eprintln!("moyboard: quick key hook failed: {e}");
            return;
        }
        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).0 > 0 {}
    });
}

#[cfg(not(windows))]
pub fn start(_app: AppHandle) {}

#[cfg(windows)]
unsafe extern "system" fn hook_proc(
    code: i32,
    wparam: windows::Win32::Foundation::WPARAM,
    lparam: windows::Win32::Foundation::LPARAM,
) -> windows::Win32::Foundation::LRESULT {
    use windows::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, KBDLLHOOKSTRUCT, WM_KEYDOWN, WM_KEYUP, WM_SYSKEYDOWN, WM_SYSKEYUP,
    };
    if code >= 0 {
        let kb = unsafe { &*(lparam.0 as *const KBDLLHOOKSTRUCT) };
        let msg = wparam.0 as u32;
        let down = msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN;
        let up = msg == WM_KEYUP || msg == WM_SYSKEYUP;
        let extended = kb.flags.0 & 0x01 != 0; // LLKHF_EXTENDED
        if let Some(spec) = *SPEC.lock().unwrap() {
            if kb.scanCode == spec.scan && extended == spec.extended {
                if down && mods_match(spec) && !DOWN.swap(true, Ordering::SeqCst) {
                    fire(ShortcutState::Pressed);
                } else if up && DOWN.swap(false, Ordering::SeqCst) {
                    fire(ShortcutState::Released);
                }
            }
        }
    }
    unsafe { CallNextHookEx(None, code, wparam, lparam) }
}

/// True when exactly the modifiers of `spec` are held.
#[cfg(windows)]
fn mods_match(spec: Spec) -> bool {
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_CONTROL, VK_LWIN, VK_MENU, VK_RWIN, VK_SHIFT};
    // The high bit of GetAsyncKeyState means "down now".
    let held = |vk: u16| unsafe { GetAsyncKeyState(vk as i32) < 0 };
    held(VK_CONTROL.0) == spec.ctrl
        && held(VK_MENU.0) == spec.alt
        && held(VK_SHIFT.0) == spec.shift
        && (held(VK_LWIN.0) || held(VK_RWIN.0)) == spec.win
}

/// Runs on the hook thread. The Quick Panel code touches windows, so it runs on the main thread.
#[cfg(windows)]
fn fire(state: ShortcutState) {
    if let Some(app) = APP.get() {
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || hotkeys::quick_panel_event(&handle, state));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_modifiers_and_scan_codes() {
        let s = spec("Ctrl+Backquote").unwrap();
        assert_eq!((s.scan, s.extended, s.ctrl, s.alt, s.shift, s.win), (0x29, false, true, false, false, false));
        let s = spec("Ctrl+Shift+KeyX").unwrap();
        assert_eq!((s.scan, s.ctrl, s.shift), (0x2D, true, true));
        assert_eq!(spec("Alt+Digit1").unwrap().scan, 0x02);
        assert_eq!(spec("Digit0").unwrap().scan, 0x0B);
        assert_eq!(spec("F12").unwrap().scan, 0x58);
        let pd = spec("PageDown").unwrap();
        assert_eq!((pd.scan, pd.extended), (0x51, true));
        assert!(spec("Super+Numpad5").is_none(), "unknown keys use RegisterHotKey");
    }
}
