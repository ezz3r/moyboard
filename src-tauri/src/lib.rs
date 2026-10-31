mod audio;
mod config;
mod library;

use audio::{DeviceInfo, Engine};
use config::{Config, SoundMeta, Store};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::Manager;

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

#[tauri::command]
fn get_library_dir(store: tauri::State<Store>) -> Result<String, String> {
    current_dir(&store).map(|d| d.display().to_string())
}

#[tauri::command]
fn set_library_dir(path: String, store: tauri::State<Store>) -> Result<String, String> {
    let dir = PathBuf::from(&path);
    library::ensure_dir(&dir)?;
    store.update(|cfg| cfg.library_dir = Some(dir.clone()))?;
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
fn rename_sound(file_name: String, new_name: String, store: tauri::State<Store>) -> Result<String, String> {
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
    Ok(new_name)
}

/// Drops the metadata of a sound whose file is gone.
#[tauri::command]
fn forget_sound(file_name: String, store: tauri::State<Store>) -> Result<(), String> {
    store.update(|cfg| cfg.sounds.remove(&file_name))?;
    Ok(())
}

#[tauri::command]
fn set_sound_meta(file_name: String, meta: SoundMeta, store: tauri::State<Store>) -> Result<(), String> {
    library::check_file_name(&file_name)?;
    store.update(|cfg| cfg.sounds.insert(file_name, meta))?;
    Ok(())
}

#[tauri::command]
fn list_output_devices(store: tauri::State<Store>) -> Result<OutputState, String> {
    Ok(OutputState {
        devices: Engine::list_devices()?,
        selected: store.get(|cfg| cfg.output_device.clone()),
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
fn play_sound(file_name: String, store: tauri::State<Store>, engine: tauri::State<AudioState>) -> Result<(), String> {
    library::check_file_name(&file_name)?;
    let dir = current_dir(&store)?;
    let path = dir.join(&file_name);
    if !path.is_file() {
        return Err(format!("file missing: {file_name}"));
    }
    let meta = store.get(|cfg| cfg.sounds.get(&file_name).cloned()).unwrap_or_default();
    lock(&engine)?.play(&path, &meta)
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
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            let store = Store::load(dir.join("moyboard.json"))
                .map_err(Box::<dyn std::error::Error>::from)?;

            let mut engine = Engine::new();
            if let Some(name) = store.get(|cfg| cfg.output_device.clone()) {
                // A saved device that is gone (unplugged, renamed) falls back to default on play.
                if let Err(e) = engine.set_device(Some(&name)) {
                    eprintln!("moyboard: saved output device unavailable: {e}");
                }
            }
            app.manage(store);
            app.manage(Mutex::new(engine));
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
            play_sound,
            stop_all,
            set_master_volume
        ])
        .run(tauri::generate_context!())
        .expect("error while running moyboard");
}
