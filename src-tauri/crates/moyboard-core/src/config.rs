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

/// How many custom colours the picker remembers.
pub const RECENT_COLORS: usize = 8;

/// Puts `color` first in the recent list. Case-insensitive, no duplicates, capped at `RECENT_COLORS`.
pub fn push_recent(list: &mut Vec<String>, color: &str) {
    let color = color.to_ascii_lowercase();
    list.retain(|c| *c != color);
    list.insert(0, color);
    list.truncate(RECENT_COLORS);
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
    /// Unused since "You" follows the Windows default output. Kept so older configs still load.
    pub monitor_device: Option<String>,
    pub monitor_volume: Option<f32>,
    /// Volume for "Others" (the main output), 0..=2. `None` means 1.0.
    pub master_volume: Option<f32>,
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
    /// Global hotkey that stops every playing sound. `None` means no hotkey.
    pub stop_all_hotkey: Option<String>,
    /// Start hidden in the tray when launched with Windows (`--minimized`). `None` means off.
    pub start_minimized: Option<bool>,
    /// Width of the edit sidebar in CSS pixels. `None` means the default.
    pub sidebar_width: Option<u32>,
    /// Smallest width of a soundboard pad in CSS pixels. `None` means the default.
    pub pad_size: Option<u32>,
    /// Height of a soundboard pad in CSS pixels. `None` means the default.
    pub pad_height: Option<u32>,
    /// Smallest width of a Quick Panel tile in CSS pixels. `None` means the default.
    pub quick_tile_size: Option<u32>,
    /// Height of a Quick Panel tile in CSS pixels. `None` means the default.
    pub quick_tile_height: Option<u32>,
    /// Last position and size of the Quick Panel. `None` means the default.
    pub quick_panel_geometry: Option<PanelGeometry>,
    /// `"sounds"` (Mode A: sounds to one output) or `"mix"` (Mode B: mic and sounds into a cable).
    /// `None` means `"sounds"`.
    pub audio_mode: Option<String>,
    /// Mode B cable: the playback endpoint (moyboard writes to it) and the recording endpoint
    /// (Discord reads from it). Endpoint IDs, not names.
    pub cable_playback: Option<String>,
    pub cable_record: Option<String>,
    /// Guided cable setup. `None` means not started, `"guided"` means the guide is waiting for a
    /// cable, `"completed"` means a cable was found and the guide is done.
    pub setup_state: Option<String>,
    /// Custom colours used lately, newest first, `#rrggbb`, at most `RECENT_COLORS`.
    pub recent_colors: Vec<String>,
    pub sounds: BTreeMap<String, SoundMeta>,
    pub categories: BTreeMap<String, CategoryMeta>,
}

impl Config {
    /// "Reset settings": every setting goes back to its default. Sounds, categories and recent
    /// colours are kept. New fields are reset too, without a line here.
    pub fn reset_settings(&mut self) {
        let sounds = std::mem::take(&mut self.sounds);
        let categories = std::mem::take(&mut self.categories);
        let recent_colors = std::mem::take(&mut self.recent_colors);
        *self = Config { sounds, categories, recent_colors, ..Default::default() };
    }
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
    fn reset_settings_keeps_sounds_categories_and_recent_colours() {
        let mut cfg = Config {
            library_dir: Some("D:/sounds".into()),
            master_volume: Some(1.5),
            quick_tile_size: Some(90),
            stop_all_hotkey: Some("Ctrl+Shift+KeyS".into()),
            audio_mode: Some("mix".into()),
            setup_state: Some("guided".into()),
            recent_colors: vec!["#5fb3c9".into()],
            ..Default::default()
        };
        cfg.sounds.insert("a.mp3".into(), SoundMeta { emoji: Some("📣".into()), ..Default::default() });
        cfg.categories.insert("c-memes".into(), CategoryMeta { name: "Memes".into(), color: None });
        cfg.reset_settings();
        assert_eq!(cfg.library_dir, None);
        assert_eq!(cfg.master_volume, None);
        assert_eq!(cfg.quick_tile_size, None);
        assert_eq!(cfg.stop_all_hotkey, None);
        assert_eq!(cfg.audio_mode, None);
        assert_eq!(cfg.setup_state, None);
        assert_eq!(cfg.sounds["a.mp3"].emoji.as_deref(), Some("📣"));
        assert_eq!(cfg.categories["c-memes"].name, "Memes");
        assert_eq!(cfg.recent_colors, vec!["#5fb3c9".to_string()]);
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
    fn recent_colours_newest_first_no_duplicates_capped() {
        let mut list = Vec::new();
        for i in 0..10 {
            push_recent(&mut list, &format!("#0000{i:02x}"));
        }
        assert_eq!(list.len(), RECENT_COLORS);
        assert_eq!(list[0], "#000009");
        push_recent(&mut list, "#00000A");
        assert_eq!(list[0], "#00000a");
        assert_eq!(list.iter().filter(|c| *c == "#00000a").count(), 1);
        assert_eq!(list.len(), RECENT_COLORS);
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
