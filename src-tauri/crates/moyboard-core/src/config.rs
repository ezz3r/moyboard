use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

/// Per-sound metadata, keyed in `Config::sounds` by file name.
/// `category` holds a category id (a key of `Config::categories`), not its name.
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct SoundMeta {
    pub category: Option<String>,
    pub emoji: Option<String>,
    pub volume: Option<f32>,
    /// Pad colour, overrides the category colour. `None` means inherit.
    pub color: Option<String>,
    pub hotkey: Option<String>,
    pub trim_start: Option<f64>,
    pub trim_end: Option<f64>,
}

/// A category's display name and colour. Its id is the key in `Config::categories`,
/// so renaming never breaks the sounds that point at it.
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct CategoryMeta {
    pub name: String,
    pub color: Option<String>,
}

/// Quick Panel position and size in physical pixels.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PanelGeometry {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// Shrinks `g` to fit inside `area` (x, y, width, height), then moves it inside.
/// Handles a saved position on a monitor that has since been unplugged or moved.
pub fn clamp_geometry(g: PanelGeometry, area: (i32, i32, u32, u32)) -> PanelGeometry {
    let (ax, ay, aw, ah) = area;
    let width = g.width.min(aw);
    let height = g.height.min(ah);
    let max_x = ax + aw as i32 - width as i32;
    let max_y = ay + ah as i32 - height as i32;
    PanelGeometry { x: g.x.clamp(ax, max_x), y: g.y.clamp(ay, max_y), width, height }
}

/// Accepts `#rrggbb` only, so the frontend cannot store arbitrary CSS.
pub fn check_color(color: &str) -> Result<(), String> {
    let ok = color.len() == 7 && color.starts_with('#') && color[1..].chars().all(|c| c.is_ascii_hexdigit());
    if ok { Ok(()) } else { Err(format!("invalid colour: {color}")) }
}

/// Trims and checks a category name. Names are short labels, not paragraphs.
pub fn clean_category_name(name: &str) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("Category name cannot be empty.".to_string());
    }
    if name.chars().count() > 40 {
        return Err("Category name is longer than 40 characters.".to_string());
    }
    Ok(name.to_string())
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Config {
    pub library_dir: Option<PathBuf>,
    /// `None` means system default output.
    pub output_device: Option<String>,
    /// `None` means monitoring is off.
    pub monitor_device: Option<String>,
    pub monitor_volume: Option<f32>,
    /// `None` means system default output. Used for headphone previews.
    pub preview_device: Option<String>,
    /// `None` means on.
    pub auto_rescan: Option<bool>,
    /// Closing the main window hides it to the tray. `None` means on.
    pub close_to_tray: Option<bool>,
    /// Global hotkey that opens the Quick Panel. `None` means no hotkey.
    pub quick_panel_hotkey: Option<String>,
    /// `"hold"` (shown while the key is down) or `"toggle"`. `None` means toggle.
    pub quick_panel_mode: Option<String>,
    /// Start hidden in the tray when launched with Windows (`--minimized`). `None` means off.
    pub start_minimized: Option<bool>,
    /// Width of the edit sidebar in CSS pixels. `None` means the default.
    pub sidebar_width: Option<u32>,
    /// Last position and size of the Quick Panel. `None` means the default.
    pub quick_panel_geometry: Option<PanelGeometry>,
    pub sounds: BTreeMap<String, SoundMeta>,
    pub categories: BTreeMap<String, CategoryMeta>,
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
            SoundMeta { emoji: Some("📣".into()), volume: Some(0.8), ..Default::default() },
        );
        let text = serde_json::to_string(&cfg).unwrap();
        assert!(text.contains("emoji"));
        let back: Config = serde_json::from_str(&text).unwrap();
        assert_eq!(back.sounds["a.mp3"], cfg.sounds["a.mp3"]);
    }

    #[test]
    fn colour_must_be_hex() {
        assert!(check_color("#f2a93b").is_ok());
        assert!(check_color("f2a93b").is_err());
        assert!(check_color("#fff").is_err());
        assert!(check_color("red").is_err());
        assert!(check_color("#zzzzzz").is_err());
    }

    #[test]
    fn category_name_is_trimmed_and_bounded() {
        assert_eq!(clean_category_name("  Memes ").unwrap(), "Memes");
        assert!(clean_category_name("   ").is_err());
        assert!(clean_category_name(&"x".repeat(41)).is_err());
    }

    #[test]
    fn panel_geometry_inside_area_is_unchanged() {
        let g = PanelGeometry { x: 100, y: 50, width: 360, height: 420 };
        assert_eq!(clamp_geometry(g, (0, 0, 1920, 1040)), g);
    }

    #[test]
    fn panel_geometry_off_screen_moves_back_in() {
        let area = (0, 0, 1920, 1040);
        let far_right = PanelGeometry { x: 3000, y: -200, width: 360, height: 420 };
        assert_eq!(clamp_geometry(far_right, area), PanelGeometry { x: 1560, y: 0, width: 360, height: 420 });
    }

    #[test]
    fn panel_geometry_larger_than_area_shrinks() {
        let g = PanelGeometry { x: 0, y: 0, width: 2000, height: 1200 };
        assert_eq!(clamp_geometry(g, (0, 0, 1280, 720)), PanelGeometry { x: 0, y: 0, width: 1280, height: 720 });
    }

    #[test]
    fn corrupt_file_is_error_not_default() {
        let path = std::env::temp_dir().join(format!("moyboard-cfg-{}.json", std::process::id()));
        fs::write(&path, "{ not json").unwrap();
        assert!(Store::load(path.clone()).is_err());
        let _ = fs::remove_file(path);
    }
}
