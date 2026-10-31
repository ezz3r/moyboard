use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use std::path::Path;
use std::sync::{mpsc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

/// Emitted to the frontend when the library folder changes on disk.
pub const EVENT: &str = "library-changed";

/// Keeps the watcher alive. Dropping it stops watching.
#[derive(Default)]
pub struct Watch(Mutex<Option<RecommendedWatcher>>);

impl Watch {
    pub fn stop(&self) {
        *self.0.lock().unwrap() = None;
    }

    /// Watches `dir` (not recursive). Bursts of events are coalesced into one emit.
    pub fn start(&self, app: &AppHandle, dir: &Path) -> Result<(), String> {
        let (tx, rx) = mpsc::channel::<()>();
        let emitter = app.clone();
        thread::spawn(move || {
            while rx.recv().is_ok() {
                thread::sleep(Duration::from_millis(300));
                while rx.try_recv().is_ok() {}
                let _ = emitter.emit(EVENT, ());
            }
        });

        let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
            if res.is_ok() {
                let _ = tx.send(());
            }
        })
        .map_err(|e| format!("watch {}: {e}", dir.display()))?;
        watcher
            .watch(dir, RecursiveMode::NonRecursive)
            .map_err(|e| format!("watch {}: {e}", dir.display()))?;
        *self.0.lock().unwrap() = Some(watcher);
        Ok(())
    }
}
