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

/// Shortcut id of the Stop all hotkey, if one is registered.
#[derive(Default)]
pub struct StopKey(pub Mutex<Option<u32>>);

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
    crate::quick_key::set(None);
    let map = app.state::<Hotkeys>();
    let mut table = map.0.lock().unwrap();
    table.clear();
    *app.state::<QuickKey>().0.lock().unwrap() = None;
    *app.state::<StopKey>().0.lock().unwrap() = None;

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
    // Always through the plugin (RegisterHotKey), so a clash with a sound is reported here.
    // shortcut: no scan-code hook path for this key, so it is matched by RegisterHotKey (layout-dependent), upgrade if that bites.
    let stop = store.get(|cfg| cfg.stop_all_hotkey.clone().filter(|h| !h.is_empty()));
    if let Some(hotkey) = stop {
        match parse(&hotkey).and_then(|s| gs.register(s).map(|()| s).map_err(|e| format!("Hotkey {hotkey} is already in use or invalid ({e})"))) {
            Ok(s) => *app.state::<StopKey>().0.lock().unwrap() = Some(s.id()),
            Err(e) => errors.push(e),
        }
    }
    // Registered after the sounds, so a clash with a sound is the one reported.
    let quick = store.get(|cfg| cfg.quick_panel_hotkey.clone().filter(|h| !h.is_empty()));
    if let Some(hotkey) = quick {
        // Keys the hook knows are matched by scan code (layout-independent); the rest use RegisterHotKey.
        if let Some(spec) = crate::quick_key::spec(&hotkey) {
            crate::quick_key::set(Some(spec));
            log_hook_key(&hotkey, &spec);
            return if errors.is_empty() { Ok(()) } else { Err(errors.join("; ")) };
        }
        match parse(&hotkey).and_then(|s| gs.register(s).map(|()| s).map_err(|e| format!("Hotkey {hotkey} is already in use or invalid ({e})"))) {
            Ok(s) => *app.state::<QuickKey>().0.lock().unwrap() = Some(s.id()),
            Err(e) => {
                eprintln!("moyboard: {e}");
                errors.push(e)
            }
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
    if *app.state::<StopKey>().0.lock().unwrap() == Some(shortcut.id()) {
        if event.state == ShortcutState::Pressed {
            if let Ok(mut engine) = crate::lock(&app.state::<crate::AudioState>()) {
                engine.stop_all();
            }
            crate::publish(app);
        }
        return;
    }
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
pub fn quick_panel_event(app: &AppHandle, state: ShortcutState) {
    let hold = app.state::<Store>().get(|cfg| cfg.quick_panel_mode.as_deref() == Some("hold"));
    // Diagnostics for the Windows hotkey bug (see docs/MANUAL-TESTS.md). Debug builds only.
    if cfg!(debug_assertions) {
        eprintln!("moyboard: quick panel key {state:?} (hold: {hold})");
    }
    match (state, hold) {
        // Auto-repeat is blocked by the OS (MOD_NOREPEAT), but a repeated Pressed must not re-show.
        (ShortcutState::Pressed, true) => {
            if !crate::quick_visible(app) {
                crate::show_quick(app)
            }
        }
        (ShortcutState::Released, true) => crate::hide_quick(app),
        (ShortcutState::Pressed, false) => crate::toggle_quick(app),
        _ => {}
    }
}

/// Debug builds only: shows which hotkey path is in use, for the Windows checks.
#[cfg(debug_assertions)]
fn log_hook_key(hotkey: &str, spec: &crate::quick_key::Spec) {
    eprintln!("moyboard: quick panel hotkey {hotkey} uses the keyboard hook: {spec:?}");
}

#[cfg(not(debug_assertions))]
fn log_hook_key(_hotkey: &str, _spec: &crate::quick_key::Spec) {}
