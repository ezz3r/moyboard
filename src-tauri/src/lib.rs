mod audio;
mod config;
mod hotkeys;
mod library;
mod watch;

use audio::{DeviceInfo, Engine};
use config::{Config, SoundMeta, Store};
use hotkeys::Hotkeys;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use watch::Watch;

type AudioState = Mutex<Engine>;

fn lock(engine: &AudioState) -> Result<std::sync::MutexGuard<'_, Engine>, String> {
    engine.lock().map_err(|_| "audio engine poisoned".to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputState {
    devices: Vec<DeviceInfo>,
    /// Saved choice; `None` means system default.
    selected: Option<String>,
    /// `None` means monitoring is off.
    monitor_selected: Option<String>,
    monitor_volume: f32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    auto_rescan: bool,
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

/// Plays a sound with its saved metadata. Used by the hotkey handler.
pub fn play_file(app: &AppHandle, file_name: &str) -> Result<(), String> {
    let store = app.state::<Store>();
    let path = sound_path(&store, file_name)?;
    let meta = store.get(|cfg| cfg.sounds.get(file_name).cloned()).unwrap_or_default();
    lock(&app.state::<AudioState>())?.play(&path, &meta)
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
fn import_files(paths: Vec<String>, store: tauri::State<Store>) -> Result<ImportReport, String> {
    let dir = current_dir(&store)?;
    let mut report = ImportReport { imported: Vec::new(), errors: Vec::new() };
    for p in paths {
        match library::import_file(Path::new(&p), &dir) {
            Ok(name) => report.imported.push(name),
            Err(e) => report.errors.push(e),
        }
    }
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
    Ok(new_name)
}

/// Drops the metadata of a sound whose file is gone.
#[tauri::command]
fn forget_sound(file_name: String, app: AppHandle, store: tauri::State<Store>) -> Result<(), String> {
    store.update(|cfg| cfg.sounds.remove(&file_name))?;
    hotkeys::sync(&app)
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
        hotkeys::parse(h)?;
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
    Ok(())
}

#[tauri::command]
fn list_output_devices(store: tauri::State<Store>) -> Result<OutputState, String> {
    let (selected, monitor_selected, monitor_volume) =
        store.get(|cfg| (cfg.output_device.clone(), cfg.monitor_device.clone(), cfg.monitor_volume));
    Ok(OutputState {
        devices: Engine::list_devices()?,
        selected,
        monitor_selected,
        monitor_volume: monitor_volume.unwrap_or(1.0),
    })
}

/// Opens the device first, then saves the choice, so a failed open changes nothing.
#[tauri::command]
fn set_output_device(
    name: Option<String>,
    store: tauri::State<Store>,
    engine: tauri::State<AudioState>,
) -> Result<(), String> {
    lock(&engine)?.set_device(name.as_deref())?;
    store.update(|cfg| cfg.output_device = name)
}

#[tauri::command]
fn set_monitor_device(
    name: Option<String>,
    store: tauri::State<Store>,
    engine: tauri::State<AudioState>,
) -> Result<(), String> {
    lock(&engine)?.set_monitor(name.as_deref())?;
    store.update(|cfg| cfg.monitor_device = name)
}

#[tauri::command]
fn set_monitor_volume(volume: f32, store: tauri::State<Store>, engine: tauri::State<AudioState>) -> Result<(), String> {
    lock(&engine)?.set_monitor_gain(volume);
    store.update(|cfg| cfg.monitor_volume = Some(volume.clamp(0.0, 2.0)))
}

#[tauri::command]
fn get_settings(store: tauri::State<Store>) -> AppSettings {
    AppSettings { auto_rescan: store.get(|cfg| cfg.auto_rescan.unwrap_or(true)) }
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

/// Plays a region using trim values from the editor, which are not saved yet.
#[tauri::command]
fn preview_sound(
    file_name: String,
    trim_start: Option<f64>,
    trim_end: Option<f64>,
    store: tauri::State<Store>,
    engine: tauri::State<AudioState>,
) -> Result<(), String> {
    let path = sound_path(&store, &file_name)?;
    let mut meta = store.get(|cfg| cfg.sounds.get(&file_name).cloned()).unwrap_or_default();
    meta.trim_start = trim_start;
    meta.trim_end = trim_end;
    lock(&engine)?.play(&path, &meta)
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
    store: tauri::State<Store>,
) -> Result<String, String> {
    let src = sound_path(&store, &file_name)?;
    let (start, take) = audio::trim_window(trim_start, trim_end)?;
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
                ..SoundMeta::default()
            },
        )
    })?;
    Ok(name)
}

#[tauri::command]
fn stop_all(engine: tauri::State<AudioState>) -> Result<(), String> {
    lock(&engine)?.stop_all();
    Ok(())
}

#[tauri::command]
fn set_master_volume(volume: f32, engine: tauri::State<AudioState>) -> Result<(), String> {
    lock(&engine)?.set_master(volume);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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

            let mut engine = Engine::new();
            // Saved devices that are gone (unplugged, renamed) are skipped; play falls back to default.
            let (out, mon, mon_gain) =
                store.get(|cfg| (cfg.output_device.clone(), cfg.monitor_device.clone(), cfg.monitor_volume));
            if let Err(e) = engine.set_device(out.as_deref()) {
                eprintln!("moyboard: saved output device unavailable: {e}");
            }
            if let Some(name) = mon {
                if let Err(e) = engine.set_monitor(Some(&name)) {
                    eprintln!("moyboard: saved monitor device unavailable: {e}");
                }
            }
            engine.set_monitor_gain(mon_gain.unwrap_or(1.0));

            app.manage(store);
            app.manage(Mutex::new(engine));
            app.manage(Hotkeys::default());
            app.manage(Watch::default());

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
            list_output_devices,
            set_output_device,
            set_monitor_device,
            set_monitor_volume,
            get_settings,
            set_auto_rescan,
            play_sound,
            preview_sound,
            waveform,
            export_trim,
            stop_all,
            set_master_volume
        ])
        .run(tauri::generate_context!())
        .expect("error while running moyboard");
}
