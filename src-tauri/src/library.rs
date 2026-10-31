use std::fs::{self, File, OpenOptions};
use std::io;
use std::path::{Path, PathBuf};

pub const EXTENSIONS: [&str; 4] = ["mp3", "wav", "ogg", "flac"];

pub fn is_supported(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

/// Default library: `<Music>/moyboard`.
pub fn default_dir() -> Result<PathBuf, String> {
    dirs::audio_dir()
        .map(|d| d.join("moyboard"))
        .ok_or_else(|| "Music folder not found".to_string())
}

pub fn ensure_dir(dir: &Path) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| format!("create {}: {e}", dir.display()))
}

/// Accepts only a bare file name, so frontend input cannot escape the library folder.
pub fn check_file_name(name: &str) -> Result<(), String> {
    let bad = name.is_empty()
        || name == "."
        || name == ".."
        || name.contains(['/', '\\', ':']);
    if bad {
        Err(format!("invalid file name: {name}"))
    } else {
        Ok(())
    }
}

/// Sorted names of supported audio files directly inside `dir`.
pub fn list_sounds(dir: &Path) -> Result<Vec<String>, String> {
    let entries = fs::read_dir(dir).map_err(|e| format!("read {}: {e}", dir.display()))?;
    let mut names = Vec::new();
    for entry in entries {
        let path = entry.map_err(|e| e.to_string())?.path();
        if path.is_file() && is_supported(&path) {
            names.extend(path.file_name().and_then(|n| n.to_str()).map(str::to_string));
        }
    }
    names.sort();
    Ok(names)
}

/// `n == 0` gives `name.mp3`, `n == 1` gives `name (1).mp3`, and so on.
fn numbered(file_name: &str, n: u32) -> String {
    if n == 0 {
        return file_name.to_string();
    }
    let path = Path::new(file_name);
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or(file_name);
    match path.extension().and_then(|e| e.to_str()) {
        Some(ext) => format!("{stem} ({n}).{ext}"),
        None => format!("{stem} ({n})"),
    }
}

/// Copies `src` into `dir` under a free name. Returns the stored file name.
/// A file that already lives in `dir` is not copied.
pub fn import_file(src: &Path, dir: &Path) -> Result<String, String> {
    if !is_supported(src) {
        return Err(format!("unsupported format: {}", src.display()));
    }
    let file_name = src
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| format!("invalid file name: {}", src.display()))?
        .to_string();

    let same_dir = match (src.parent().map(fs::canonicalize), fs::canonicalize(dir)) {
        (Some(Ok(parent)), Ok(target)) => parent == target,
        _ => false,
    };
    if same_dir {
        return Ok(file_name);
    }

    let mut n = 0;
    loop {
        let name = numbered(&file_name, n);
        let dest = dir.join(&name);
        match OpenOptions::new().write(true).create_new(true).open(&dest) {
            Ok(mut out) => {
                let copied = File::open(src).and_then(|mut inp| io::copy(&mut inp, &mut out));
                if let Err(e) = copied {
                    let _ = fs::remove_file(&dest);
                    return Err(format!("copy {}: {e}", src.display()));
                }
                return Ok(name);
            }
            Err(e) if e.kind() == io::ErrorKind::AlreadyExists => n += 1,
            Err(e) => return Err(format!("create {}: {e}", dest.display())),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("moyboard-test-{}-{tag}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn numbered_names() {
        assert_eq!(numbered("a.mp3", 0), "a.mp3");
        assert_eq!(numbered("a.mp3", 2), "a (2).mp3");
        assert_eq!(numbered("noext", 1), "noext (1)");
    }

    #[test]
    fn supported_extensions_case_insensitive() {
        assert!(is_supported(Path::new("x.MP3")));
        assert!(is_supported(Path::new("x.flac")));
        assert!(!is_supported(Path::new("x.txt")));
        assert!(!is_supported(Path::new("x")));
    }

    #[test]
    fn file_name_rejects_paths() {
        assert!(check_file_name("ok.mp3").is_ok());
        assert!(check_file_name("../x.mp3").is_err());
        assert!(check_file_name("a/b.mp3").is_err());
        assert!(check_file_name("..").is_err());
        assert!(check_file_name("").is_err());
    }

    #[test]
    fn import_avoids_collisions_and_lists() {
        let lib = temp_dir("lib");
        let src_dir = temp_dir("src");
        let src = src_dir.join("boom.WAV");
        fs::write(&src, b"abc").unwrap();
        fs::write(src_dir.join("notes.txt"), b"x").unwrap();

        assert_eq!(import_file(&src, &lib).unwrap(), "boom.WAV");
        assert_eq!(import_file(&src, &lib).unwrap(), "boom (1).WAV");
        assert_eq!(fs::read(lib.join("boom (1).WAV")).unwrap(), b"abc");
        assert_eq!(list_sounds(&lib).unwrap(), vec!["boom (1).WAV", "boom.WAV"]);
        assert!(import_file(&src_dir.join("notes.txt"), &lib).is_err());
    }

    #[test]
    fn import_from_inside_library_does_not_copy() {
        let lib = temp_dir("inside");
        let f = lib.join("in.ogg");
        fs::write(&f, b"x").unwrap();
        assert_eq!(import_file(&f, &lib).unwrap(), "in.ogg");
        assert_eq!(list_sounds(&lib).unwrap(), vec!["in.ogg"]);
    }
}
