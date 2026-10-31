use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

/// Per-sound metadata, keyed in `Config::sounds` by file name.
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct SoundMeta {
    pub category: Option<String>,
    pub display_name: Option<String>,
    pub emoji: Option<String>,
    pub volume: Option<f32>,
    pub hotkey: Option<String>,
    pub trim_start: Option<f64>,
    pub trim_end: Option<f64>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Config {
    pub library_dir: Option<PathBuf>,
    /// `None` means system default output.
    pub output_device: Option<String>,
    pub sounds: BTreeMap<String, SoundMeta>,
}

/// Holds `moyboard.json` in the app data dir. Writes go through a temp file, then rename.
pub struct Store {
    path: PathBuf,
    data: Mutex<Config>,
}

impl Store {
    /// A missing file means defaults. A file that fails to parse is an error,
    /// so a later save cannot silently wipe the user's metadata.
    pub fn load(path: PathBuf) -> Result<Self, String> {
        let data = match fs::read_to_string(&path) {
            Ok(text) => serde_json::from_str(&text)
                .map_err(|e| format!("parse {}: {e}", path.display()))?,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Config::default(),
            Err(e) => return Err(format!("read {}: {e}", path.display())),
        };
        Ok(Self { path, data: Mutex::new(data) })
    }

    pub fn get<T>(&self, f: impl FnOnce(&Config) -> T) -> T {
        f(&self.data.lock().unwrap())
    }

    /// Applies `f` to the config and saves it to disk. Returns `f`'s result.
    pub fn update<T>(&self, f: impl FnOnce(&mut Config) -> T) -> Result<T, String> {
        let mut data = self.data.lock().unwrap();
        let out = f(&mut data);
        self.save(&data)?;
        Ok(out)
    }

    fn save(&self, data: &Config) -> Result<(), String> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let text = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
        let tmp = self.path.with_extension("json.tmp");
        fs::write(&tmp, text).map_err(|e| format!("write {}: {e}", tmp.display()))?;
        fs::rename(&tmp, &self.path).map_err(|e| format!("replace {}: {e}", self.path.display()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_and_camel_case() {
        let mut cfg = Config::default();
        cfg.sounds.insert(
            "a.mp3".into(),
            SoundMeta { display_name: Some("Air horn".into()), volume: Some(0.8), ..Default::default() },
        );
        let text = serde_json::to_string(&cfg).unwrap();
        assert!(text.contains("displayName"));
        let back: Config = serde_json::from_str(&text).unwrap();
        assert_eq!(back.sounds["a.mp3"], cfg.sounds["a.mp3"]);
    }

    #[test]
    fn corrupt_file_is_error_not_default() {
        let path = std::env::temp_dir().join(format!("moyboard-cfg-{}.json", std::process::id()));
        fs::write(&path, "{ not json").unwrap();
        assert!(Store::load(path.clone()).is_err());
        let _ = fs::remove_file(path);
    }
}
