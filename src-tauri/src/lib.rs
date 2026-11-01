mod audio;
mod hotkeys;
mod mic;
mod quick_key;
mod watch;

use moyboard_core::{config, library, wav};

use audio::{DeviceInfo, Engine, Playing};
use config::{CategoryMeta, Config, PanelGeometry, SoundMeta, Store, check_color, clean_category_name};
use moyboard_core::cable::{self, CablePair, Endpoint};
use hotkeys::Hotkeys;
use serde::Serialize;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_autostart::ManagerExt;
use watch::Watch;

type AudioState = Mutex<Engine>;

/// Last playback list sent to the UI. `publish` sends only when this changes.
#[derive(Default)]
struct LastPlayback(Mutex<Vec<Playing>>);

fn lock(engine: &AudioState) -> Result<std::sync::MutexGuard<'_, Engine>, String> {
    engine.lock().map_err(|_| "audio engine poisoned".to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputState {
    devices: Vec<DeviceInfo>,
    /// Saved choice; `None` means system default.
    selected: Option<String>,
    /// Volume for "Others" (main output), 0..=2.
    master_volume: f32,
    monitor_volume: f32,
    /// Saved preview choice; `None` means system default.
    preview_selected: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutostartSettings {
    /// Read from the system, not from the config: the Run entry can be removed elsewhere.
    enabled: bool,
    start_minimized: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    auto_rescan: bool,
    close_to_tray: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SoundEntry {
    file_name: String,
    /// Metadata exists but the file is gone from the library folder.
    missing: bool,
    meta: SoundMeta,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportReport {
    imported: Vec<String>,
    errors: Vec<String>,
}

fn resolve_dir(cfg: &Config) -> Result<PathBuf, String> {
    match &cfg.library_dir {
        Some(dir) => Ok(dir.clone()),
        None => library::default_dir(),
    }
}

fn current_dir(store: &Store) -> Result<PathBuf, String> {
    let dir = store.get(resolve_dir)?;
    library::ensure_dir(&dir)?;
    Ok(dir)
}

/// Path of a sound in the library. Rejects bad names and missing files.
fn sound_path(store: &Store, file_name: &str) -> Result<PathBuf, String> {
    library::check_file_name(file_name)?;
    let path = current_dir(store)?.join(file_name);
    if !path.is_file() {
        return Err(format!("file missing: {file_name}"));
    }
    Ok(path)
}

/// Plays a sound with its saved metadata on the main output.
pub fn play_file(app: &AppHandle, file_name: &str) -> Result<(), String> {
    let store = app.state::<Store>();
    let path = sound_path(&store, file_name)?;
    let meta = store.get(|cfg| cfg.sounds.get(file_name).cloned()).unwrap_or_default();
    let audio = app.state::<AudioState>();
    let result = lock(&audio)?.play(file_name, &path, &meta);
    publish(app);
    result
}

/// Plays the sound, or stops it if it is already playing. Used by the hotkey handler.
pub fn toggle_file(app: &AppHandle, file_name: &str) -> Result<(), String> {
    let audio = app.state::<AudioState>();
    let playing = lock(&audio)?.is_playing(file_name, Some(false));
    if playing {
        lock(&audio)?.stop_file(file_name, Some(false));
        publish(app);
        Ok(())
    } else {
        play_file(app, file_name)
    }
}

/// Sends the playback list to the UI if it changed since the last send.
pub fn publish(app: &AppHandle) {
    let audio = app.state::<AudioState>();
    let now = match lock(&audio) {
        Ok(mut engine) => engine.playing(),
        Err(_) => return,
    };
    let last = app.state::<LastPlayback>();
    let mut prev = last.0.lock().unwrap();
    if *prev == now {
        return;
    }
    *prev = now.clone();
    drop(prev);
    let _ = app.emit("playback", now);
}

/// Tells every window the library or its metadata changed, so the Quick Panel refreshes too.
fn notify_changed(app: &AppHandle) {
    let _ = app.emit(watch::EVENT, ());
}

const QUICK_LABEL: &str = "quick-panel";

/// Turns off the Windows fade when the Quick Panel is shown or hidden.
/// shortcut: if DWM ignores this on some builds, the fade stays; documented in MANUAL-TESTS.
#[cfg(windows)]
fn disable_os_transitions(w: &WebviewWindow) {
    use windows::core::BOOL;
    use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_TRANSITIONS_FORCEDISABLED};
    if let Ok(hwnd) = w.hwnd() {
        let on = BOOL::from(true);
        // SAFETY: the attribute is a BOOL and the buffer is its size; hwnd is our own window.
        let _ = unsafe {
            DwmSetWindowAttribute(
                hwnd,
                DWMWA_TRANSITIONS_FORCEDISABLED,
                &on as *const BOOL as *const _,
                std::mem::size_of::<BOOL>() as u32,
            )
        };
    }
}

fn quick_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(QUICK_LABEL)
}

pub fn show_quick(app: &AppHandle) {
    if let Some(w) = quick_window(app) {
        apply_quick_geometry(app, &w);
        let _ = w.show();
    }
}

/// Puts the panel where the user left it, clamped to the monitor it is on (or the first one).
fn apply_quick_geometry(app: &AppHandle, w: &WebviewWindow) {
    let Some(saved) = app.state::<Store>().get(|cfg| cfg.quick_panel_geometry) else {
        // Nothing saved yet: centre it once; the first move or resize then saves its place.
        let _ = w.center();
        return;
    };
    let Ok(monitors) = w.available_monitors() else {
        return;
    };
    let (cx, cy) = (saved.x + saved.width as i32 / 2, saved.y + saved.height as i32 / 2);
    let on_it = |m: &&tauri::Monitor| {
        let a = m.work_area();
        cx >= a.position.x
            && cx < a.position.x + a.size.width as i32
            && cy >= a.position.y
            && cy < a.position.y + a.size.height as i32
    };
    let Some(monitor) = monitors.iter().find(on_it).or(monitors.first()) else {
        return;
    };
    let a = monitor.work_area();
    let area = (a.position.x, a.position.y, a.size.width, a.size.height);
    let g = config::clamp_geometry(saved, area);
    // Position before size: setting the size first can apply the previous monitor's scale factor.
    let _ = w.set_position(tauri::PhysicalPosition::new(g.x, g.y));
    let _ = w.set_size(tauri::PhysicalSize::new(g.width, g.height));
    // Tells the page that the move and resize below are ours, so it does not save them back.
    let _ = w.emit("quick-panel-restored", ());
}

pub fn quick_visible(app: &AppHandle) -> bool {
    quick_window(app).is_some_and(|w| w.is_visible().unwrap_or(false))
}

pub fn hide_quick(app: &AppHandle) {
    if let Some(w) = quick_window(app) {
        let _ = w.hide();
    }
}

pub fn toggle_quick(app: &AppHandle) {
    match quick_window(app) {
        Some(w) if w.is_visible().unwrap_or(false) => {
            let _ = w.hide();
        }
        Some(_) => show_quick(app),
        None => {}
    }
}

/// Starts, stops, or moves the folder watcher to match the current settings.
fn restart_watch(app: &AppHandle) -> Result<(), String> {
    let watch = app.state::<Watch>();
    watch.stop();
    let store = app.state::<Store>();
    if !store.get(|cfg| cfg.auto_rescan.unwrap_or(true)) {
        return Ok(());
    }
    let dir = current_dir(&store)?;
    watch.start(app, &dir)
}

#[tauri::command]
fn get_library_dir(store: tauri::State<Store>) -> Result<String, String> {
    current_dir(&store).map(|d| d.display().to_string())
}

#[tauri::command]
fn set_library_dir(path: String, app: AppHandle, store: tauri::State<Store>) -> Result<String, String> {
    let dir = PathBuf::from(&path);
    library::ensure_dir(&dir)?;
    store.update(|cfg| cfg.library_dir = Some(dir.clone()))?;
    restart_watch(&app)?;
    Ok(dir.display().to_string())
}

/// Scans the library folder. New files appear with default metadata;
/// config entries whose file is gone come back flagged `missing`.
#[tauri::command]
fn rescan(store: tauri::State<Store>) -> Result<Vec<SoundEntry>, String> {
    let dir = current_dir(&store)?;
    let files = library::list_sounds(&dir)?;
    let mut entries: Vec<SoundEntry> = files
        .iter()
        .map(|name| SoundEntry {
            file_name: name.clone(),
            missing: false,
            meta: store.get(|cfg| cfg.sounds.get(name).cloned()).unwrap_or_default(),
        })
        .collect();
    store.get(|cfg| {
        for (name, meta) in &cfg.sounds {
            if !files.contains(name) {
                entries.push(SoundEntry { file_name: name.clone(), missing: true, meta: meta.clone() });
            }
        }
    });
    Ok(entries)
}

/// Copies dropped files into the library folder. Each file is handled on its own,
/// so one bad file does not stop the rest.
#[tauri::command]
fn import_files(paths: Vec<String>, app: AppHandle, store: tauri::State<Store>) -> Result<ImportReport, String> {
    let dir = current_dir(&store)?;
    let mut report = ImportReport { imported: Vec::new(), errors: Vec::new() };
    for p in paths {
        match library::import_file(Path::new(&p), &dir) {
            Ok(name) => report.imported.push(name),
            Err(e) => report.errors.push(e),
        }
    }
    notify_changed(&app);
    Ok(report)
}

/// Renames the file on disk and moves its metadata to the new name.
#[tauri::command]
fn rename_sound(
    file_name: String,
    new_name: String,
    app: AppHandle,
    store: tauri::State<Store>,
) -> Result<String, String> {
    library::check_file_name(&file_name)?;
    library::check_file_name(&new_name)?;
    if !library::is_supported(Path::new(&new_name)) {
        return Err(format!("unsupported format: {new_name}"));
    }
    let dir = current_dir(&store)?;
    let from = dir.join(&file_name);
    let to = dir.join(&new_name);
    // A case-only rename on Windows matches the same file, so compare canonical paths.
    let same_file = fs::canonicalize(&from).ok() == fs::canonicalize(&to).ok();
    if to.exists() && !same_file {
        return Err(format!("a sound named {new_name} already exists"));
    }
    fs::rename(&from, &to).map_err(|e| format!("rename {file_name}: {e}"))?;
    store.update(|cfg| {
        if let Some(meta) = cfg.sounds.remove(&file_name) {
            cfg.sounds.insert(new_name.clone(), meta);
        }
    })?;
    hotkeys::sync(&app)?;
    notify_changed(&app);
    Ok(new_name)
}

/// Drops the metadata of a sound whose file is gone.
#[tauri::command]
fn forget_sound(file_name: String, app: AppHandle, store: tauri::State<Store>) -> Result<(), String> {
    store.update(|cfg| cfg.sounds.remove(&file_name))?;
    hotkeys::sync(&app)?;
    notify_changed(&app);
    Ok(())
}

/// Moves the sound file to the Recycle Bin, then drops its metadata and hotkey.
/// Stops it first if it is playing. A file that is already gone only loses its metadata.
#[tauri::command]
fn delete_sound(file_name: String, app: AppHandle, store: tauri::State<Store>) -> Result<(), String> {
    library::check_file_name(&file_name)?;
    let audio = app.state::<AudioState>();
    lock(&audio)?.stop_file(&file_name, None);
    publish(&app);

    let path = current_dir(&store)?.join(&file_name);
    if path.is_file() {
        trash::delete(&path).map_err(|e| format!("move {file_name} to the Recycle Bin: {e}"))?;
    }
    store.update(|cfg| cfg.sounds.remove(&file_name))?;
    hotkeys::sync(&app)?;
    notify_changed(&app);
    Ok(())
}

/// Which hotkey setting is being saved, so it does not clash with its own stored value.
#[derive(Clone, Copy)]
enum Slot<'a> {
    Sound(&'a str),
    Quick,
    Stop,
}

/// Refuses a hotkey that another sound, the Quick Panel or Stop all already uses.
fn check_hotkey_free(cfg: &Config, hotkey: &str, me: Slot) -> Result<(), String> {
    let id = hotkeys::parse(hotkey)?.id();
    let same = |h: &str| hotkeys::parse(h).is_ok_and(|s| s.id() == id);
    for (file, meta) in &cfg.sounds {
        if matches!(me, Slot::Sound(f) if f == file) {
            continue;
        }
        if meta.hotkey.as_deref().is_some_and(same) {
            return Err(format!("{file} already uses this hotkey"));
        }
    }
    if !matches!(me, Slot::Quick) && cfg.quick_panel_hotkey.as_deref().is_some_and(same) {
        return Err("Quick Panel already uses this hotkey".to_string());
    }
    if !matches!(me, Slot::Stop) && cfg.stop_all_hotkey.as_deref().is_some_and(same) {
        return Err("Stop all sounds already uses this hotkey".to_string());
    }
    Ok(())
}

/// Saves metadata, then re-registers hotkeys. If a hotkey cannot be registered
/// (already taken by another app, for example), the previous metadata is restored
/// and the error is returned.
#[tauri::command]
fn set_sound_meta(
    file_name: String,
    meta: SoundMeta,
    app: AppHandle,
    store: tauri::State<Store>,
) -> Result<(), String> {
    library::check_file_name(&file_name)?;
    if let Some(h) = meta.hotkey.as_deref().filter(|h| !h.is_empty()) {
        store.get(|cfg| check_hotkey_free(cfg, h, Slot::Sound(&file_name)))?;
    }
    if let Some(c) = meta.color.as_deref() {
        check_color(c)?;
    }
    let previous = store.get(|cfg| cfg.sounds.get(&file_name).cloned());
    store.update(|cfg| cfg.sounds.insert(file_name.clone(), meta))?;
    if let Err(e) = hotkeys::sync(&app) {
        store.update(|cfg| match previous {
            Some(m) => {
                cfg.sounds.insert(file_name.clone(), m);
            }
            None => {
                cfg.sounds.remove(&file_name);
            }
        })?;
        hotkeys::sync(&app)?;
        return Err(format!("{e} (hotkey not saved)"));
    }
    notify_changed(&app);
    Ok(())
}

#[tauri::command]
fn list_categories(store: tauri::State<Store>) -> BTreeMap<String, CategoryMeta> {
    store.get(|cfg| cfg.categories.clone())
}

/// Creates a category with a fresh id. Returns the id.
#[tauri::command]
fn new_category(name: String, app: AppHandle, store: tauri::State<Store>) -> Result<String, String> {
    let name = clean_category_name(&name)?;
    let id = store.update(|cfg| -> Result<String, String> {
        ensure_unique_name(cfg, &name, None)?;
        let id = loop {
            let nanos = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|e| e.to_string())?
                .as_nanos();
            let id = format!("c{nanos:x}");
            if !cfg.categories.contains_key(&id) {
                break id;
            }
        };
        cfg.categories.insert(id.clone(), CategoryMeta { name, color: None });
        Ok(id)
    })??;
    notify_changed(&app);
    Ok(id)
}

/// Renames or recolours a category. Sounds keep pointing at the same id.
/// A category that has sounds but no saved entry gets one here.
#[tauri::command]
fn set_category(
    id: String,
    name: String,
    color: Option<String>,
    app: AppHandle,
    store: tauri::State<Store>,
) -> Result<(), String> {
    let name = clean_category_name(&name)?;
    if let Some(c) = color.as_deref() {
        check_color(c)?;
    }
    store.update(|cfg| -> Result<(), String> {
        ensure_unique_name(cfg, &name, Some(&id))?;
        cfg.categories.insert(id, CategoryMeta { name, color });
        Ok(())
    })??;
    notify_changed(&app);
    Ok(())
}

/// Removes a category. Its sounds move to Uncategorized (they stay in the library).
#[tauri::command]
fn delete_category(id: String, app: AppHandle, store: tauri::State<Store>) -> Result<(), String> {
    store.update(|cfg| {
        cfg.categories.remove(&id);
        for meta in cfg.sounds.values_mut() {
            if meta.category.as_deref() == Some(id.as_str()) {
                meta.category = None;
            }
        }
    })?;
    hotkeys::sync(&app)?;
    notify_changed(&app);
    Ok(())
}

/// Two categories may not share a name, ignoring case. `own` is the id being edited.
fn ensure_unique_name(cfg: &Config, name: &str, own: Option<&str>) -> Result<(), String> {
    let taken = cfg
        .categories
        .iter()
        .any(|(id, c)| Some(id.as_str()) != own && c.name.eq_ignore_ascii_case(name));
    if taken {
        Err(format!("a category named {name} already exists"))
    } else {
        Ok(())
    }
}

#[tauri::command]
fn list_output_devices(store: tauri::State<Store>) -> Result<OutputState, String> {
    let (selected, monitor_volume, master_volume, preview_selected) = store.get(|cfg| {
        (cfg.output_device.clone(), cfg.monitor_volume, cfg.master_volume, cfg.preview_device.clone())
    });
    Ok(OutputState {
        devices: Engine::list_devices()?,
        selected,
        master_volume: master_volume.unwrap_or(1.0),
        monitor_volume: monitor_volume.unwrap_or(1.0),
        preview_selected,
    })
}

/// Same order as `set_output_device`: open first, save only on success.
#[tauri::command]
fn set_preview_device(
    name: Option<String>,
    store: tauri::State<Store>,
    engine: tauri::State<AudioState>,
) -> Result<(), String> {
    lock(&engine)?.set_preview(name.as_deref())?;
    store.update(|cfg| cfg.preview_device = name)
}

/// Opens the device first, then saves the choice, so a failed open changes nothing.
#[tauri::command]
fn set_output_device(
    name: Option<String>,
    store: tauri::State<Store>,
    engine: tauri::State<AudioState>,
) -> Result<(), String> {
    if store.get(|cfg| cfg.audio_mode.as_deref() == Some("mix")) {
        return Err("Mode B sends to the virtual cable. Switch to Mode A to pick another output.".into());
    }
    lock(&engine)?.set_device(name.as_deref())?;
    store.update(|cfg| cfg.output_device = name)
}

/// Audio routing as saved. The cable's live state comes from `detect_cable`.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoutingState {
    /// `"sounds"` (Mode A) or `"mix"` (Mode B).
    mode: String,
    cable_playback: Option<String>,
    cable_record: Option<String>,
    setup_state: Option<String>,
    mic_id: Option<String>,
    mic_volume: f32,
    banner_dismissed: bool,
}

#[tauri::command]
fn get_routing(store: tauri::State<Store>) -> RoutingState {
    store.get(|cfg| RoutingState {
        mode: cfg.audio_mode.clone().unwrap_or_else(|| "sounds".into()),
        cable_playback: cfg.cable_playback.clone(),
        cable_record: cfg.cable_record.clone(),
        setup_state: cfg.setup_state.clone(),
        mic_id: cfg.mic_id.clone(),
        mic_volume: cfg.mic_volume.unwrap_or(1.0),
        banner_dismissed: cfg.banner_dismissed.unwrap_or(false),
    })
}

/// Mode A (`sounds`) uses the chosen output. Mode B (`mix`) uses the cable's playback side.
/// The device opens before the mode is saved, so a failure changes nothing.
#[tauri::command]
fn set_audio_mode(
    mode: String,
    app: AppHandle,
    store: tauri::State<Store>,
    engine: tauri::State<AudioState>,
) -> Result<(), String> {
    if mode != "sounds" && mode != "mix" {
        return Err(format!("unknown audio mode: {mode}"));
    }
    let (cable, output) = store.get(|cfg| (cfg.cable_playback.clone(), cfg.output_device.clone()));
    let target = if mode == "mix" {
        Some(cable.ok_or("Choose a virtual cable first.")?)
    } else {
        output
    };
    let (mic_id, gain) = store.get(|cfg| (cfg.mic_id.clone(), cfg.mic_volume.unwrap_or(1.0)));
    let mut engine = lock(&engine)?;
    engine.set_device(target.as_deref())?;
    // A mic that fails to start does not block the mode change; `get_mic_status` reports it.
    let _ = engine.set_mic(mode == "mix", mic_id.as_deref(), gain);
    set_tray_tooltip(&app, mode == "mix");
    store.update(|cfg| cfg.audio_mode = Some(mode))
}

/// Tray tooltip says when the mic is being mixed into the cable.
fn set_tray_tooltip(app: &AppHandle, mix: bool) {
    if let Some(tray) = app.tray_by_id("main") {
        let text = if mix { "moyboard – Mic routing active" } else { "moyboard" };
        let _ = tray.set_tooltip(Some(text));
    }
}

/// Cable test: plays a tone into the cable and checks that it arrives on the recording side.
/// Async because it waits for the tone to come back; the UI thread stays free.
#[tauri::command]
async fn test_cable(store: tauri::State<'_, Store>, engine: tauri::State<'_, AudioState>) -> Result<(), String> {
    let (mix, record) = store.get(|cfg| (cfg.audio_mode.as_deref() == Some("mix"), cfg.cable_record.clone()));
    if !mix {
        return Err("Choose \"Mic and sounds\" first.".into());
    }
    let record = record.ok_or("Choose a cable first.")?;
    lock(&engine)?.play_test_tone()?;
    let peak = tauri::async_runtime::spawn_blocking(move || mic::peak_of(&record, Duration::from_millis(1500)))
        .await
        .map_err(|e| e.to_string())??;
    if peak < 0.02 {
        return Err("No sound arrived on the recording side. Check that moyboard is running and that your app uses the recording side.".into());
    }
    Ok(())
}

/// Hides the main window's setup banner for good.
#[tauri::command]
fn dismiss_banner(store: tauri::State<Store>) -> Result<(), String> {
    store.update(|cfg| cfg.banner_dismissed = Some(true))
}

/// Opens Windows Settings at the microphone privacy page, so the user can allow moyboard.
#[tauri::command]
fn open_mic_privacy() -> Result<(), String> {
    #[cfg(windows)]
    {
        std::process::Command::new("explorer.exe")
            .arg("ms-settings:privacy-microphone")
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("open Settings: {e}"))
    }
    #[cfg(not(windows))]
    {
        Err("Microphone privacy settings exist only on Windows.".into())
    }
}

/// Mode B microphone state for the Settings screen.
#[tauri::command]
fn get_mic_status(engine: tauri::State<AudioState>) -> Result<audio::MicStatus, String> {
    Ok(lock(&engine)?.mic_status())
}

/// Peak mic level since the last call, 0..=1. The meter polls this.
#[tauri::command]
fn get_mic_level(engine: tauri::State<AudioState>) -> Result<f32, String> {
    Ok(lock(&engine)?.mic_level())
}

/// Saves the microphone (`None` = Windows default) and applies it now in Mode B.
/// The choice is saved even when the mic cannot start, so a replugged mic is picked up later.
#[tauri::command]
fn set_mic_device(id: Option<String>, store: tauri::State<Store>, engine: tauri::State<AudioState>) -> Result<(), String> {
    let (mix, gain) = store.get(|cfg| (cfg.audio_mode.as_deref() == Some("mix"), cfg.mic_volume.unwrap_or(1.0)));
    store.update(|cfg| cfg.mic_id = id.clone())?;
    lock(&engine)?.set_mic(mix, id.as_deref(), gain)
}

#[tauri::command]
fn set_mic_volume(volume: f32, store: tauri::State<Store>, engine: tauri::State<AudioState>) -> Result<(), String> {
    let volume = volume.clamp(0.0, 2.0);
    lock(&engine)?.set_mic_gain(volume);
    store.update(|cfg| cfg.mic_volume = Some(volume))
}

/// Saves the Mode B cable. Both sides must be connected right now.
#[tauri::command]
fn set_cable(
    playback: String,
    record: String,
    store: tauri::State<Store>,
    engine: tauri::State<AudioState>,
) -> Result<(), String> {
    let (out, inp) = endpoints_now()?;
    cable::check_pair(&out, &inp, &playback, &record)
        .ok_or("That cable is not connected. Check that both sides are listed in Windows.")?;
    if store.get(|cfg| cfg.audio_mode.as_deref() == Some("mix")) {
        lock(&engine)?.set_device(Some(&playback))?;
    }
    store.update(|cfg| {
        cfg.cable_playback = Some(playback);
        cfg.cable_record = Some(record);
    })
}

/// The cable to use now: the saved pair when both sides are still there, otherwise the first
/// known cable found by name. `None` when no cable is connected.
#[tauri::command]
fn detect_cable(store: tauri::State<Store>) -> Result<Option<CablePair>, String> {
    let (out, inp) = endpoints_now()?;
    let saved = store.get(|cfg| (cfg.cable_playback.clone(), cfg.cable_record.clone()));
    if let (Some(p), Some(r)) = saved {
        if let Some(pair) = cable::check_pair(&out, &inp, &p, &r) {
            return Ok(Some(pair));
        }
    }
    Ok(cable::find_cable(&out, &inp))
}

/// Saved guided-setup state: `None`, `"guided"` or `"completed"`.
#[tauri::command]
fn set_setup_state(state: Option<String>, store: tauri::State<Store>) -> Result<(), String> {
    if let Some(s) = &state {
        if s != "guided" && s != "completed" {
            return Err(format!("unknown setup state: {s}"));
        }
    }
    store.update(|cfg| cfg.setup_state = state)
}

#[tauri::command]
fn list_input_devices() -> Result<Vec<DeviceInfo>, String> {
    Engine::list_input_devices()
}

/// Opens one of the fixed help links in the default browser. Anything else is refused, so the
/// frontend cannot open arbitrary URLs.
#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    const ALLOWED: [&str; 2] = ["https://vb-audio.com/Cable/", "https://vb-audio.com/"];
    if !ALLOWED.contains(&url.as_str()) {
        return Err("link not allowed".into());
    }
    // explorer.exe hands an https URL to the default browser. Other systems use xdg-open (dev only).
    #[cfg(windows)]
    let program = "explorer.exe";
    #[cfg(not(windows))]
    let program = "xdg-open";
    std::process::Command::new(program)
        .arg(&url)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("open browser: {e}"))
}

fn endpoints_now() -> Result<(Vec<Endpoint>, Vec<Endpoint>), String> {
    let to_endpoints =
        |list: Vec<DeviceInfo>| list.into_iter().map(|d| Endpoint { id: d.id, name: d.name }).collect();
    Ok((to_endpoints(Engine::list_devices()?), to_endpoints(Engine::list_input_devices()?)))
}

#[tauri::command]
fn set_monitor_volume(volume: f32, store: tauri::State<Store>, engine: tauri::State<AudioState>) -> Result<(), String> {
    lock(&engine)?.set_monitor_gain(volume);
    store.update(|cfg| cfg.monitor_volume = Some(volume.clamp(0.0, 2.0)))
}

#[tauri::command]
fn get_settings(store: tauri::State<Store>) -> AppSettings {
    AppSettings {
        auto_rescan: store.get(|cfg| cfg.auto_rescan.unwrap_or(true)),
        close_to_tray: store.get(|cfg| cfg.close_to_tray.unwrap_or(true)),
    }
}

#[tauri::command]
fn get_autostart(app: AppHandle, store: tauri::State<Store>) -> Result<AutostartSettings, String> {
    Ok(AutostartSettings {
        enabled: app.autolaunch().is_enabled().map_err(|e| e.to_string())?,
        start_minimized: store.get(|cfg| cfg.start_minimized.unwrap_or(false)),
    })
}

#[tauri::command]
fn set_autostart(enabled: bool, app: AppHandle) -> Result<(), String> {
    let manager = app.autolaunch();
    if enabled { manager.enable() } else { manager.disable() }.map_err(|e| format!("start with Windows: {e}"))
}

#[tauri::command]
fn set_start_minimized(enabled: bool, store: tauri::State<Store>) -> Result<(), String> {
    store.update(|cfg| cfg.start_minimized = Some(enabled))
}

/// Sidebar width in CSS pixels. Stored as given; the UI clamps it to the window.
pub const SIDEBAR_WIDTH_RANGE: std::ops::RangeInclusive<u32> = 200..=2000;

#[tauri::command]
fn get_sidebar_width(store: tauri::State<Store>) -> u32 {
    store.get(|cfg| cfg.sidebar_width).unwrap_or(300)
}

#[tauri::command]
fn set_sidebar_width(width: u32, store: tauri::State<Store>) -> Result<(), String> {
    if !SIDEBAR_WIDTH_RANGE.contains(&width) {
        return Err(format!("sidebar width {width} is out of range"));
    }
    store.update(|cfg| cfg.sidebar_width = Some(width))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TileSizes {
    /// Minimum width of a soundboard pad.
    pad: u32,
    pad_height: u32,
    /// Minimum width of a Quick Panel tile.
    quick: u32,
    quick_height: u32,
}

#[tauri::command]
fn get_tile_sizes(store: tauri::State<Store>) -> TileSizes {
    store.get(|cfg| TileSizes {
        pad: cfg.pad_size.unwrap_or(128),
        pad_height: cfg.pad_height.unwrap_or(128),
        quick: cfg.quick_tile_size.unwrap_or(56),
        quick_height: cfg.quick_tile_height.unwrap_or(56),
    })
}

/// `kind` is `"pad"` or `"quick"` (minimum width) or `"padHeight"` / `"quickHeight"`.
#[tauri::command]
fn set_tile_size(kind: String, size: u32, app: AppHandle, store: tauri::State<Store>) -> Result<(), String> {
    let range = match kind.as_str() {
        "pad" => 96..=240,
        "quick" => 16..=400,
        "padHeight" => 64..=240,
        "quickHeight" => 16..=400,
        _ => return Err(format!("unknown tile kind: {kind}")),
    };
    if !range.contains(&size) {
        return Err(format!("tile size {size} is out of range"));
    }
    store.update(|cfg| match kind.as_str() {
        "pad" => cfg.pad_size = Some(size),
        "padHeight" => cfg.pad_height = Some(size),
        "quick" => cfg.quick_tile_size = Some(size),
        _ => cfg.quick_tile_height = Some(size),
    })?;
    notify_changed(&app);
    Ok(())
}

#[tauri::command]
fn set_close_to_tray(enabled: bool, store: tauri::State<Store>) -> Result<(), String> {
    store.update(|cfg| cfg.close_to_tray = Some(enabled))
}

/// Shows the main window, restoring it from minimized if needed.
fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

fn toggle_main(app: &AppHandle) {
    match app.get_webview_window("main") {
        Some(w) if w.is_visible().unwrap_or(false) => {
            let _ = w.hide();
        }
        _ => show_main(app),
    }
}

/// Tray icon and menu.
fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open moyboard", true, None::<&str>)?;
    let panel = MenuItem::with_id(app, "panel", "Quick Panel", true, None::<&str>)?;
    let stop = MenuItem::with_id(app, "stop", "Stop all sounds", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&open, &panel, &sep, &stop, &quit])?;
    let icon = app.default_window_icon().cloned();

    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("moyboard")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main(app),
            "panel" => toggle_quick(app),
            "stop" => {
                if let Ok(mut engine) = lock(&app.state::<AudioState>()) {
                    engine.stop_all();
                }
                publish(app);
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                toggle_main(tray.app_handle());
            }
        });
    if let Some(icon) = icon {
        tray = tray.icon(icon);
    }
    tray.build(app)?;
    Ok(())
}

#[tauri::command]
fn set_auto_rescan(enabled: bool, app: AppHandle, store: tauri::State<Store>) -> Result<(), String> {
    store.update(|cfg| cfg.auto_rescan = Some(enabled))?;
    restart_watch(&app)
}

#[tauri::command]
fn play_sound(file_name: String, app: AppHandle) -> Result<(), String> {
    play_file(&app, &file_name)
}

/// Stops one sound. `preview_only` limits it to the headphone preview, or to the main output.
#[tauri::command]
fn stop_sound(
    file_name: String,
    preview_only: Option<bool>,
    app: AppHandle,
    engine: tauri::State<AudioState>,
) -> Result<(), String> {
    lock(&engine)?.stop_file(&file_name, preview_only);
    publish(&app);
    Ok(())
}

/// Auditions a sound on the preview device only, with its saved trim.
#[tauri::command]
fn preview_sound(file_name: String, app: AppHandle, store: tauri::State<Store>) -> Result<(), String> {
    let path = sound_path(&store, &file_name)?;
    let meta = store.get(|cfg| cfg.sounds.get(&file_name).cloned()).unwrap_or_default();
    let audio = app.state::<AudioState>();
    let result = lock(&audio)?.play_preview(&file_name, &path, &meta);
    publish(&app);
    result
}

/// Plays a region using trim values from the editor, which are not saved yet.
/// Goes to the preview device, like the headphone button.
#[tauri::command]
fn preview_region(
    file_name: String,
    trim_start: Option<f64>,
    trim_end: Option<f64>,
    app: AppHandle,
    store: tauri::State<Store>,
) -> Result<(), String> {
    let path = sound_path(&store, &file_name)?;
    let mut meta = store.get(|cfg| cfg.sounds.get(&file_name).cloned()).unwrap_or_default();
    meta.trim_start = trim_start;
    meta.trim_end = trim_end;
    let audio = app.state::<AudioState>();
    let result = lock(&audio)?.play_preview(&file_name, &path, &meta);
    publish(&app);
    result
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WaveformDto {
    peaks: Vec<f32>,
    peaks_per_sec: usize,
    duration_secs: f64,
}

#[tauri::command]
fn waveform(file_name: String, store: tauri::State<Store>) -> Result<WaveformDto, String> {
    let path = sound_path(&store, &file_name)?;
    let w = audio::waveform(&path)?;
    Ok(WaveformDto {
        peaks: w.peaks,
        peaks_per_sec: audio::PEAKS_PER_SEC,
        duration_secs: w.duration_secs,
    })
}

/// Writes the trimmed region as a new WAV in the library. Category and icon carry over.
#[tauri::command]
fn export_trim(
    file_name: String,
    trim_start: Option<f64>,
    trim_end: Option<f64>,
    app: AppHandle,
    store: tauri::State<Store>,
) -> Result<String, String> {
    let src = sound_path(&store, &file_name)?;
    let (start, take) = wav::trim_window(trim_start, trim_end)?;
    let dir = current_dir(&store)?;
    let stem = Path::new(&file_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("sound")
        .to_string();
    let (name, file) = library::create_unique(&dir, &format!("{stem} (trimmed).wav"))?;
    let dest = dir.join(&name);

    let mut out = std::io::BufWriter::new(file);
    if let Err(e) = audio::write_trim_wav(&src, &mut out, start, take) {
        drop(out);
        let _ = fs::remove_file(&dest);
        return Err(e);
    }
    drop(out);

    let source = store.get(|cfg| cfg.sounds.get(&file_name).cloned()).unwrap_or_default();
    store.update(|cfg| {
        cfg.sounds.insert(
            name.clone(),
            SoundMeta {
                category: source.category,
                emoji: source.emoji,
                volume: source.volume,
                color: source.color,
                ..SoundMeta::default()
            },
        )
    })?;
    notify_changed(&app);
    Ok(name)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickPanelSettings {
    hotkey: Option<String>,
    /// `"hold"` or `"toggle"`.
    mode: String,
}

#[tauri::command]
fn get_quick_panel_settings(store: tauri::State<Store>) -> QuickPanelSettings {
    store.get(|cfg| QuickPanelSettings {
        hotkey: cfg.quick_panel_hotkey.clone(),
        mode: cfg.quick_panel_mode.clone().unwrap_or_else(|| "toggle".to_string()),
    })
}

/// Saves the Quick Panel hotkey and mode. A hotkey already used by a sound is refused,
/// and a hotkey that cannot be registered is rolled back, as for sound hotkeys.
#[tauri::command]
fn set_quick_panel_settings(
    hotkey: Option<String>,
    mode: String,
    app: AppHandle,
    store: tauri::State<Store>,
) -> Result<(), String> {
    if mode != "hold" && mode != "toggle" {
        return Err(format!("unknown Quick Panel mode: {mode}"));
    }
    let hotkey = hotkey.filter(|h| !h.is_empty());
    if let Some(h) = &hotkey {
        store.get(|cfg| check_hotkey_free(cfg, h, Slot::Quick))?;
    }
    let previous = store.get(|cfg| (cfg.quick_panel_hotkey.clone(), cfg.quick_panel_mode.clone()));
    store.update(|cfg| {
        cfg.quick_panel_hotkey = hotkey;
        cfg.quick_panel_mode = Some(mode);
    })?;
    if let Err(e) = hotkeys::sync(&app) {
        store.update(|cfg| {
            cfg.quick_panel_hotkey = previous.0;
            cfg.quick_panel_mode = previous.1;
        })?;
        hotkeys::sync(&app)?;
        return Err(format!("{e} (hotkey not saved)"));
    }
    Ok(())
}

#[tauri::command]
fn get_recent_colors(store: tauri::State<Store>) -> Vec<String> {
    store.get(|cfg| cfg.recent_colors.clone())
}

/// Remembers a colour the user applied. Only `#rrggbb` is kept.
#[tauri::command]
fn push_recent_color(color: String, store: tauri::State<Store>) -> Result<(), String> {
    check_color(&color)?;
    store.update(|cfg| config::push_recent(&mut cfg.recent_colors, &color))
}

#[tauri::command]
fn get_stop_all_hotkey(store: tauri::State<Store>) -> Option<String> {
    store.get(|cfg| cfg.stop_all_hotkey.clone())
}

/// Saves the Stop all hotkey. Refused if another sound or panel uses it; rolled back if it cannot be registered.
#[tauri::command]
fn set_stop_all_hotkey(hotkey: Option<String>, app: AppHandle, store: tauri::State<Store>) -> Result<(), String> {
    let hotkey = hotkey.filter(|h| !h.is_empty());
    if let Some(h) = &hotkey {
        store.get(|cfg| check_hotkey_free(cfg, h, Slot::Stop))?;
    }
    let previous = store.get(|cfg| cfg.stop_all_hotkey.clone());
    store.update(|cfg| cfg.stop_all_hotkey = hotkey)?;
    if let Err(e) = hotkeys::sync(&app) {
        store.update(|cfg| cfg.stop_all_hotkey = previous)?;
        hotkeys::sync(&app)?;
        return Err(format!("{e} (hotkey not saved)"));
    }
    Ok(())
}

/// Saved by the panel after a move or resize has settled.
#[tauri::command]
fn save_quick_panel_geometry(
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    store: tauri::State<Store>,
) -> Result<(), String> {
    if width == 0 || height == 0 {
        return Err("panel size must be positive".to_string());
    }
    store.update(|cfg| cfg.quick_panel_geometry = Some(PanelGeometry { x, y, width, height }))
}

/// Forgets the saved position and size, and puts the panel back at its default size, centred.
#[tauri::command]
fn reset_quick_panel_geometry(app: AppHandle, store: tauri::State<Store>) -> Result<(), String> {
    reset_quick_geometry(&app, &store)
}

/// Forgets the saved Quick Panel position and size, and puts the window back at its default size.
fn reset_quick_geometry(app: &AppHandle, store: &Store) -> Result<(), String> {
    store.update(|cfg| cfg.quick_panel_geometry = None)?;
    if let Some(w) = quick_window(app) {
        w.set_size(tauri::LogicalSize::new(360.0, 420.0)).map_err(|e| e.to_string())?;
        w.center().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// "Reset settings": every setting goes back to its default, including the library folder and
/// "Start with Windows". Sounds, categories and recent colours stay.
#[tauri::command]
fn reset_settings(app: AppHandle, store: tauri::State<Store>, engine: tauri::State<AudioState>) -> Result<(), String> {
    store.update(|cfg| cfg.reset_settings())?;
    {
        let mut engine = lock(&engine)?;
        engine.set_device(None)?;
        engine.set_preview(None)?;
        engine.set_monitor_gain(1.0);
        engine.set_master(1.0);
    }
    let autostart = app.autolaunch();
    if autostart.is_enabled().map_err(|e| e.to_string())? {
        autostart.disable().map_err(|e| format!("start with Windows: {e}"))?;
    }
    reset_quick_geometry(&app, &store)?;
    hotkeys::sync(&app)?;
    restart_watch(&app)?;
    notify_changed(&app);
    Ok(())
}

#[tauri::command]
fn show_quick_panel(app: AppHandle) {
    show_quick(&app);
}

#[tauri::command]
fn hide_quick_panel(app: AppHandle) {
    hide_quick(&app);
}

#[tauri::command]
fn stop_all(app: AppHandle, engine: tauri::State<AudioState>) -> Result<(), String> {
    lock(&engine)?.stop_all();
    publish(&app);
    Ok(())
}

#[tauri::command]
fn set_master_volume(volume: f32, store: tauri::State<Store>, engine: tauri::State<AudioState>) -> Result<(), String> {
    lock(&engine)?.set_master(volume);
    store.update(|cfg| cfg.master_volume = Some(volume.clamp(0.0, 2.0)))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // First, so a second launch hands its arguments here and exits.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(hotkeys::on_event)
                .build(),
        )
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            let store = Store::load(dir.join("moyboard.json"))
                .map_err(Box::<dyn std::error::Error>::from)?;

            // Older configs store device names; convert them to IDs once and save the result.
            let (out, prev) = store.get(|cfg| {
                let fix = |v: &Option<String>| v.as_deref().map(audio::migrate_device);
                (fix(&cfg.output_device), fix(&cfg.preview_device))
            });
            store.update(|cfg| {
                cfg.output_device = out.clone();
                cfg.preview_device = prev.clone();
            })?;

            let mut engine = Engine::new();
            let mon_gain = store.get(|cfg| cfg.monitor_volume);
            // Mode B opens the cable instead of the saved output. The saved output stays as it was.
            let active = store.get(|cfg| match cfg.audio_mode.as_deref() {
                Some("mix") => cfg.cable_playback.clone(),
                _ => out.clone(),
            });
            // A saved main or preview device that is gone is kept, so play reports it instead of using the default.
            if let Err(e) = engine.set_device(active.as_deref()) {
                eprintln!("moyboard: saved output device unavailable: {e}");
                engine.keep_unavailable(active.as_deref(), None);
            }
            engine.set_monitor_gain(mon_gain.unwrap_or(1.0));
            engine.set_master(store.get(|cfg| cfg.master_volume).unwrap_or(1.0));
            let (mix, mic_id, mic_gain) = store.get(|cfg| {
                (cfg.audio_mode.as_deref() == Some("mix"), cfg.mic_id.clone(), cfg.mic_volume.unwrap_or(1.0))
            });
            let _ = engine.set_mic(mix, mic_id.as_deref(), mic_gain);
            if let Err(e) = engine.set_preview(prev.as_deref()) {
                eprintln!("moyboard: saved preview device unavailable: {e}");
                engine.keep_unavailable(None, prev.as_deref());
            }

            // The Run entry always passes --minimized; the setting decides whether it is honoured.
            let hide_at_start = std::env::args().any(|a| a == "--minimized")
                && store.get(|cfg| cfg.start_minimized.unwrap_or(false));

            app.manage(store);
            app.manage(Mutex::new(engine));
            app.manage(Hotkeys::default());
            app.manage(hotkeys::QuickKey::default());
            app.manage(hotkeys::StopKey::default());
            quick_key::start(app.handle().clone());
            app.manage(Watch::default());
            app.manage(LastPlayback::default());

            // Sounds end on their own, so the UI learns about it by polling. Cheap: one lock.
            let handle = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_millis(150));
                publish(&handle);
            });

            // Restarts a mic that was unplugged or not there yet. Cheap when nothing is wanted.
            let handle = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_secs(2));
                if let Ok(mut engine) = lock(&handle.state::<AudioState>()) {
                    let _ = engine.ensure_mic();
                }
            });

            if let Err(e) = build_tray(app.handle()) {
                eprintln!("moyboard: tray icon: {e}");
            }
            set_tray_tooltip(app.handle(), app.state::<Store>().get(|cfg| cfg.audio_mode.as_deref() == Some("mix")));
            if !hide_at_start {
                show_main(app.handle());
            }
            // Hidden until its hotkey (or the tray) shows it. Shown without taking focus.
            let panel = WebviewWindowBuilder::new(app, QUICK_LABEL, WebviewUrl::App("index.html".into()))
                .title("moyboard Quick Panel")
                .inner_size(360.0, 420.0)
                .min_inner_size(240.0, 180.0)
                .decorations(false)
                .always_on_top(true)
                .skip_taskbar(true)
                .resizable(true)
                .focusable(false)
                .visible(false)
                .build()?;
            #[cfg(windows)]
            disable_os_transitions(&panel);
            let handle = app.handle().clone();
            panel.on_window_event(move |event| {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    hide_quick(&handle);
                }
            });
            if let Some(main) = app.get_webview_window("main") {
                let handle = app.handle().clone();
                main.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        if handle.state::<Store>().get(|cfg| cfg.close_to_tray.unwrap_or(true)) {
                            if let Some(w) = handle.get_webview_window("main") {
                                let _ = w.hide();
                            }
                        } else {
                            handle.exit(0);
                        }
                    }
                });
            }

            if let Err(e) = hotkeys::sync(app.handle()) {
                eprintln!("moyboard: hotkeys: {e}");
            }
            if let Err(e) = restart_watch(app.handle()) {
                eprintln!("moyboard: folder watch: {e}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_library_dir,
            set_library_dir,
            rescan,
            import_files,
            set_sound_meta,
            rename_sound,
            forget_sound,
            delete_sound,
            list_categories,
            new_category,
            set_category,
            delete_category,
            list_output_devices,
            set_output_device,
            get_routing,
            set_audio_mode,
            get_mic_status,
            get_mic_level,
            set_mic_device,
            set_mic_volume,
            test_cable,
            dismiss_banner,
            open_mic_privacy,
            set_cable,
            detect_cable,
            set_setup_state,
            list_input_devices,
            open_url,
            set_monitor_volume,
            set_preview_device,
            get_settings,
            set_auto_rescan,
            set_close_to_tray,
            get_sidebar_width,
            set_sidebar_width,
            get_tile_sizes,
            set_tile_size,
            get_autostart,
            set_autostart,
            set_start_minimized,
            get_quick_panel_settings,
            set_quick_panel_settings,
            get_stop_all_hotkey,
            get_recent_colors,
            push_recent_color,
            set_stop_all_hotkey,
            show_quick_panel,
            hide_quick_panel,
            save_quick_panel_geometry,
            reset_quick_panel_geometry,
            play_sound,
            stop_sound,
            preview_sound,
            preview_region,
            waveform,
            export_trim,
            stop_all,
            set_master_volume,
            reset_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running moyboard");
}
