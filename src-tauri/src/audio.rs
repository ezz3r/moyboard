use crate::mic::Mic;
use moyboard_core::config::SoundMeta;
use moyboard_core::wav::{trim_window, wav_header};
use cpal::traits::{DeviceTrait, HostTrait};
use rodio::{Decoder, DeviceSinkBuilder, MixerDeviceSink, Player, Source};
use serde::Serialize;
use std::fs::File;
use std::io::{self, Seek, SeekFrom, Write};
use std::path::Path;
use std::time::Duration;

/// Shown when a saved device ID no longer matches an output (unplugged, driver changed).
pub const DEVICE_MISSING: &str = "Device not found, please select it again in Settings";

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    /// Stable WASAPI endpoint ID (`wasapi:...`). This is what is stored and compared.
    pub id: String,
    /// Display only: names are not unique.
    pub name: String,
    pub is_default: bool,
}

/// One sound that is playing, as sent to the UI. `previewing` is true for the headphone preview.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Playing {
    pub file_name: String,
    pub previewing: bool,
}

struct Voice {
    file: String,
    /// Plays on the preview device only, never on the main or monitor output.
    preview: bool,
    main: Player,
    monitor: Option<Player>,
    /// Per-sound volume, before master volume is applied.
    volume: f32,
}

/// Output stream(s) and the sounds currently playing.
/// Each sound gets its own `Player` per output, so sounds overlap.
pub struct Engine {
    sink: Option<MixerDeviceSink>,
    /// ID of the chosen primary device; `None` means system default.
    primary_id: Option<String>,
    /// Monitor stream on the Windows default output; see `monitor_stream`.
    monitor_sink: Option<MixerDeviceSink>,
    /// ID of the device `monitor_sink` is open on.
    monitor_id: Option<String>,
    monitor_gain: f32,
    preview_sink: Option<MixerDeviceSink>,
    /// ID of the preview device; `None` means system default.
    preview_id: Option<String>,
    voices: Vec<Voice>,
    master: f32,
    /// Mode B: the microphone is mixed into the main output while this is set.
    mic_on: bool,
    mic_id: Option<String>,
    mic_gain: f32,
    mic: Option<Mic>,
    /// Why the last mic start failed, shown in Settings. `None` when running or off.
    mic_error: Option<String>,
}

/// Mic state as sent to the UI.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MicStatus {
    /// Mode B is on and the mic should be running.
    pub active: bool,
    pub running: bool,
    pub error: Option<String>,
}

impl Engine {
    pub fn new() -> Self {
        Self {
            sink: None,
            primary_id: None,
            monitor_sink: None,
            monitor_id: None,
            monitor_gain: 1.0,
            preview_sink: None,
            preview_id: None,
            voices: Vec::new(),
            master: 1.0,
            mic_on: false,
            mic_id: None,
            mic_gain: 1.0,
            mic: None,
            mic_error: None,
        }
    }

    pub fn list_devices() -> Result<Vec<DeviceInfo>, String> {
        let host = cpal::default_host();
        let default = default_device_id();
        let devices = host.output_devices().map_err(|e| e.to_string())?;
        Ok(devices
            .filter_map(|d| {
                let id = device_id(&d)?;
                Some(DeviceInfo { name: device_name(&d), is_default: Some(&id) == default.as_ref(), id })
            })
            .collect())
    }

    /// Recording endpoints (inputs), with the same IDs as outputs use. Only for cable detection
    /// and the microphone list; nothing is opened here.
    pub fn list_input_devices() -> Result<Vec<DeviceInfo>, String> {
        let host = cpal::default_host();
        let default = host.default_input_device().and_then(|d| device_id(&d));
        let devices = host.input_devices().map_err(|e| e.to_string())?;
        Ok(devices
            .filter_map(|d| {
                let id = device_id(&d)?;
                Some(DeviceInfo { name: device_name(&d), is_default: Some(&id) == default.as_ref(), id })
            })
            .collect())
    }

    /// `None` selects the system default output. Stops main playback, keeps previews.
    pub fn set_device(&mut self, id: Option<&str>) -> Result<(), String> {
        let sink = open(id)?;
        self.voices.retain(|v| v.preview);
        self.sink = Some(sink);
        self.primary_id = id.map(str::to_string);
        // The mic lives on the old output's mixer, so it moves to the new one.
        self.mic = None;
        let _ = self.ensure_mic();
        Ok(())
    }

    /// Turns the Mode B mic on or off. The mic is mixed into the main output's mixer.
    /// A mic that cannot start is not an error for the mode change: the status reports it.
    pub fn set_mic(&mut self, on: bool, id: Option<&str>, gain: f32) -> Result<(), String> {
        self.mic_on = on;
        self.mic_id = id.map(str::to_string);
        self.mic_gain = gain.clamp(0.0, 2.0);
        self.mic = None;
        self.mic_error = None;
        self.ensure_mic()
    }

    /// Starts the mic if it should run and is not running. Also restarts it after a failure
    /// (unplugged, driver reset), so the caller can poll this.
    pub fn ensure_mic(&mut self) -> Result<(), String> {
        if !self.mic_on || self.mic.as_ref().is_some_and(|m| !m.failed()) {
            return Ok(());
        }
        self.mic = None;
        let Some(sink) = self.sink.as_ref() else {
            return Err("no output stream".to_string());
        };
        match Mic::start(self.mic_id.as_deref(), sink.mixer(), self.mic_gain) {
            Ok(mic) => {
                self.mic = Some(mic);
                self.mic_error = None;
                Ok(())
            }
            Err(e) => {
                self.mic_error = Some(e.clone());
                Err(e)
            }
        }
    }

    pub fn set_mic_gain(&mut self, gain: f32) {
        self.mic_gain = gain.clamp(0.0, 2.0);
        if let Some(mic) = &self.mic {
            mic.set_gain(self.mic_gain);
        }
    }

    /// Peak of the mic since the last call, 0..=1 (0 when not running).
    pub fn mic_level(&self) -> f32 {
        self.mic.as_ref().map_or(0.0, Mic::level)
    }

    pub fn mic_status(&self) -> MicStatus {
        MicStatus {
            active: self.mic_on,
            running: self.mic.as_ref().is_some_and(|m| !m.failed()),
            error: self.mic_error.clone(),
        }
    }

    /// "You" hears the sound on the Windows default output. It is off when that device is the
    /// main output, so the cable never gets a second copy.
    pub fn monitor_active(&self) -> bool {
        let default = default_device_id();
        default.is_some() && default != resolved(&self.primary_id)
    }

    /// Opens (or reuses) the monitor stream on the Windows default output. `None` when the
    /// default is the main output.
    fn monitor_stream(&mut self) -> Result<Option<&MixerDeviceSink>, String> {
        if !self.monitor_active() {
            self.monitor_sink = None;
            self.monitor_id = None;
            return Ok(None);
        }
        // shortcut: a default-device change applies to sounds started after it, upgrade by watching the default device
        let default = default_device_id();
        if self.monitor_id != default {
            self.monitor_sink = Some(open(None)?);
            self.monitor_id = default;
        }
        Ok(self.monitor_sink.as_ref())
    }

    /// `None` means the system default output. The stream opens now only for a named
    /// device, so a bad ID is reported at once; the default opens on first preview.
    pub fn set_preview(&mut self, id: Option<&str>) -> Result<(), String> {
        self.preview_sink = match id {
            Some(_) => Some(open(id)?),
            None => None,
        };
        self.preview_id = id.map(str::to_string);
        Ok(())
    }

    /// Saved main or preview device that did not open at startup. Playing then reports it
    /// missing instead of silently using the system default.
    pub fn keep_unavailable(&mut self, primary: Option<&str>, preview: Option<&str>) {
        if let Some(id) = primary {
            self.primary_id = Some(id.to_string());
        }
        if let Some(id) = preview {
            self.preview_id = Some(id.to_string());
        }
    }

    pub fn set_monitor_gain(&mut self, gain: f32) {
        self.monitor_gain = gain.clamp(0.0, 2.0);
        self.apply_volumes();
    }

    /// Plays `path` on the main output (and the monitor, if on).
    pub fn play(&mut self, file: &str, path: &Path, meta: &SoundMeta) -> Result<(), String> {
        let (start, take) = trim_window(meta.trim_start, meta.trim_end)?;
        let volume = meta.volume.unwrap_or(1.0).clamp(0.0, 2.0);

        if self.sink.is_none() {
            self.sink = Some(open(self.primary_id.as_deref())?);
        }
        let main_sink = self.sink.as_ref().ok_or("no output stream")?;
        let main = spawn(main_sink, path, start, take)?;
        let monitor = match self.monitor_stream()? {
            Some(sink) => Some(spawn(sink, path, start, take)?),
            None => None,
        };

        self.voices.retain(|v| !v.main.empty());
        self.voices.push(Voice { file: file.to_string(), preview: false, main, monitor, volume });
        self.apply_volumes();
        Ok(())
    }

    /// Plays `path` on the preview device. The preview may be the main device too (one headset
    /// for headphones and mic); it then also reaches the main output.
    pub fn play_preview(&mut self, file: &str, path: &Path, meta: &SoundMeta) -> Result<(), String> {
        let (start, take) = trim_window(meta.trim_start, meta.trim_end)?;
        let volume = meta.volume.unwrap_or(1.0).clamp(0.0, 2.0);

        if self.preview_sink.is_none() {
            self.preview_sink = Some(open(self.preview_id.as_deref())?);
        }
        let sink = self.preview_sink.as_ref().ok_or("no preview stream")?;
        let player = spawn(sink, path, start, take)?;

        self.voices.retain(|v| !v.main.empty());
        self.voices.push(Voice { file: file.to_string(), preview: true, main: player, monitor: None, volume });
        self.apply_volumes();
        Ok(())
    }

    /// Stops the voices for `file`. `preview`: `Some(true)` only the preview,
    /// `Some(false)` only the main output, `None` both.
    pub fn stop_file(&mut self, file: &str, preview: Option<bool>) {
        self.voices.retain(|v| {
            if v.file != file || preview.is_some_and(|p| p != v.preview) {
                return true;
            }
            v.main.stop();
            if let Some(m) = &v.monitor {
                m.stop();
            }
            false
        });
    }

    pub fn is_playing(&self, file: &str, preview: Option<bool>) -> bool {
        self.voices
            .iter()
            .any(|v| v.file == file && preview.is_none_or(|p| p == v.preview) && !v.main.empty())
    }

    /// Drops finished voices and lists the rest.
    pub fn playing(&mut self) -> Vec<Playing> {
        self.voices.retain(|v| !v.main.empty());
        self.voices
            .iter()
            .map(|v| Playing { file_name: v.file.clone(), previewing: v.preview })
            .collect()
    }

    pub fn stop_all(&mut self) {
        for voice in self.voices.drain(..) {
            voice.main.stop();
            if let Some(m) = voice.monitor {
                m.stop();
            }
        }
    }

    pub fn set_master(&mut self, master: f32) {
        self.master = master.clamp(0.0, 2.0);
        self.apply_volumes();
    }

    fn apply_volumes(&self) {
        for v in &self.voices {
            if v.preview {
                // Previews follow "You" (monitor gain), not "Others": they never reach the cable.
                v.main.set_volume(v.volume * self.monitor_gain);
                continue;
            }
            v.main.set_volume(v.volume * self.master);
            if let Some(m) = &v.monitor {
                // "You" hears the sound as it is: Others (master) only affects the cable.
                m.set_volume(v.volume * self.monitor_gain);
            }
        }
    }
}

/// Decodes `path` from the trim start and plays it on `sink`.
fn spawn(sink: &MixerDeviceSink, path: &Path, start: Duration, take: Option<Duration>) -> Result<Player, String> {
    let decoder = open_decoder(path)?;
    let player = Player::connect_new(sink.mixer());
    match take {
        Some(take) => player.append(decoder.skip_duration(start).take_duration(take)),
        None => player.append(decoder.skip_duration(start)),
    }
    Ok(player)
}

/// ID of the system default output, if any. Used to resolve "system default" before comparing.
fn default_device_id() -> Option<String> {
    cpal::default_host().default_output_device().and_then(|d| device_id(&d))
}

/// `None` (system default) resolves to the real default device ID, so two devices can be compared.
fn resolved(id: &Option<String>) -> Option<String> {
    id.clone().or_else(default_device_id)
}

fn device_id(device: &cpal::Device) -> Option<String> {
    device.id().ok().map(|id| id.to_string())
}

fn device_name(device: &cpal::Device) -> String {
    device.description().map_or("unknown".to_string(), |d| d.name().to_string())
}

/// Turns a saved output setting into an ID. Settings written by older versions hold a name:
/// convert it when one device has that name. Anything else is returned unchanged.
pub fn migrate_device(saved: &str) -> String {
    if saved.parse::<cpal::DeviceId>().is_ok() {
        return saved.to_string();
    }
    cpal::default_host()
        .output_devices()
        .ok()
        .and_then(|mut devices| devices.find(|d| device_name(d) == saved))
        .and_then(|d| device_id(&d))
        .unwrap_or_else(|| saved.to_string())
}

fn open(id: Option<&str>) -> Result<MixerDeviceSink, String> {
    let host = cpal::default_host();
    let device = match id {
        Some(wanted) => wanted
            .parse::<cpal::DeviceId>()
            .ok()
            .and_then(|parsed| host.device_by_id(&parsed))
            .ok_or_else(|| DEVICE_MISSING.to_string())?,
        None => host.default_output_device().ok_or("no default output device")?,
    };
    DeviceSinkBuilder::from_device(device)
        .and_then(|b| b.open_stream())
        .map_err(|e| format!("open output device: {e}"))
}

/// Peak envelope resolution. 100 per second is smooth at editor widths and small in memory.
pub const PEAKS_PER_SEC: usize = 100;

pub struct Waveform {
    /// Max absolute amplitude (0..=1) per 1/PEAKS_PER_SEC second, across all channels.
    pub peaks: Vec<f32>,
    pub duration_secs: f64,
}

fn open_decoder(path: &Path) -> Result<Decoder<io::BufReader<File>>, String> {
    let file = File::open(path).map_err(|e| format!("open {}: {e}", path.display()))?;
    Decoder::try_from(file).map_err(|e| format!("decode {}: {e}", path.display()))
}

/// Streams the file once, so memory stays flat for long sounds.
pub fn waveform(path: &Path) -> Result<Waveform, String> {
    let decoder = open_decoder(path)?;
    let per_sec = decoder.sample_rate().get() as usize * decoder.channels().get() as usize;
    let window = (per_sec / PEAKS_PER_SEC).max(1);

    let mut peaks = Vec::new();
    let (mut max, mut n, mut total) = (0f32, 0usize, 0usize);
    for s in decoder {
        max = max.max(s.abs());
        n += 1;
        total += 1;
        if n == window {
            peaks.push(max);
            max = 0.0;
            n = 0;
        }
    }
    if n > 0 {
        peaks.push(max);
    }
    Ok(Waveform { peaks, duration_secs: total as f64 / per_sec as f64 })
}

/// Writes the region `start..start+take` of `src` as 16-bit PCM WAV into `out`.
/// `out` must be empty and positioned at 0.
pub fn write_trim_wav<W: Write + Seek>(
    src: &Path,
    out: &mut W,
    start: Duration,
    take: Option<Duration>,
) -> Result<(), String> {
    let decoder = open_decoder(src)?;
    let rate = decoder.sample_rate().get();
    let channels = decoder.channels().get();
    let per_sec = rate as f64 * channels as f64;
    let skip = (start.as_secs_f64() * per_sec).round() as usize;
    let limit = take.map_or(usize::MAX, |t| (t.as_secs_f64() * per_sec).round() as usize);

    let io_err = |e: io::Error| format!("write wav: {e}");
    out.write_all(&wav_header(channels, rate, 0)).map_err(io_err)?;
    let mut data_bytes: u64 = 0;
    for s in decoder.skip(skip).take(limit) {
        let v = (s.clamp(-1.0, 1.0) * 32767.0).round() as i16;
        out.write_all(&v.to_le_bytes()).map_err(io_err)?;
        data_bytes += 2;
    }
    if data_bytes > u32::MAX as u64 - 36 {
        return Err("clip too long for a WAV file".to_string());
    }
    let data_len = data_bytes as u32;
    out.seek(SeekFrom::Start(0)).map_err(io_err)?;
    out.write_all(&wav_header(channels, rate, data_len)).map_err(io_err)?;
    out.flush().map_err(io_err)
}
