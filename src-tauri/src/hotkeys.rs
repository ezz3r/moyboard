use moyboard_core::config::Store;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

/// Shortcut id -> file name. Filled by `sync`, read by the global handler.
#[derive(Default)]
pub struct Hotkeys(pub Mutex<HashMap<u32, String>>);

/// Shortcut id of the Quick Panel hotkey, if one is registered.
#[derive(Default)]
pub struct QuickKey(pub Mutex<Option<u32>>);

/// Parses a hotkey like "Ctrl+Shift+Digit1". Empty string means none.
pub fn parse(hotkey: &str) -> Result<Shortcut, String> {
    hotkey
        .parse::<Shortcut>()
        .map_err(|e| format!("invalid hotkey {hotkey}: {e}"))
}

/// Registers every sound's hotkey from the current config. Replaces all previous registrations.
pub fn sync(app: &AppHandle) -> Result<(), String> {
    let store = app.state::<Store>();
    let bindings: Vec<(String, String)> = store.get(|cfg| {
        cfg.sounds
            .iter()
            .filter_map(|(file, meta)| meta.hotkey.clone().filter(|h| !h.is_empty()).map(|h| (file.clone(), h)))
            .collect()
    });

    let gs = app.global_shortcut();
    gs.unregister_all().map_err(|e| e.to_string())?;
    let map = app.state::<Hotkeys>();
    let mut table = map.0.lock().unwrap();
    table.clear();
    *app.state::<QuickKey>().0.lock().unwrap() = None;

    let mut errors = Vec::new();
    for (file, hotkey) in bindings {
        let shortcut = match parse(&hotkey) {
            Ok(s) => s,
            Err(e) => {
                errors.push(e);
                continue;
            }
        };
        match gs.register(shortcut) {
            Ok(()) => {
                table.insert(shortcut.id(), file);
            }
            Err(e) => errors.push(format!("hotkey {hotkey} for {file}: {e}")),
        }
    }
    // Registered after the sounds, so a clash with a sound is the one reported.
    let quick = store.get(|cfg| cfg.quick_panel_hotkey.clone().filter(|h| !h.is_empty()));
    if let Some(hotkey) = quick {
        match parse(&hotkey).and_then(|s| gs.register(s).map(|()| s).map_err(|e| format!("quick panel hotkey {hotkey}: {e}"))) {
            Ok(s) => *app.state::<QuickKey>().0.lock().unwrap() = Some(s.id()),
            Err(e) => errors.push(e),
        }
    }
    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors.join("; "))
    }
}

/// Plugin handler. Plays or stops the sound bound to a pressed shortcut.
pub fn on_event(app: &AppHandle, shortcut: &Shortcut, event: tauri_plugin_global_shortcut::ShortcutEvent) {
    if *app.state::<QuickKey>().0.lock().unwrap() == Some(shortcut.id()) {
        quick_panel_event(app, event.state);
        return;
    }
    if event.state != ShortcutState::Pressed {
        return;
    }
    let file = match app.state::<Hotkeys>().0.lock().unwrap().get(&shortcut.id()) {
        Some(f) => f.clone(),
        None => return,
    };
    if let Err(e) = crate::toggle_file(app, &file) {
        eprintln!("moyboard: hotkey play failed: {e}");
    }
}

/// Hold: shown while the key is down. Toggle: each press flips it.
fn quick_panel_event(app: &AppHandle, state: ShortcutState) {
    let hold = app.state::<Store>().get(|cfg| cfg.quick_panel_mode.as_deref() == Some("hold"));
    match (state, hold) {
        (ShortcutState::Pressed, true) => crate::show_quick(app),
        (ShortcutState::Released, true) => crate::hide_quick(app),
        (ShortcutState::Pressed, false) => crate::toggle_quick(app),
        _ => {}
    }
}
