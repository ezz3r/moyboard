use crate::config::SoundMeta;
use cpal::traits::{DeviceTrait, HostTrait};
use rodio::{Decoder, DeviceSinkBuilder, MixerDeviceSink, Player, Source};
use serde::Serialize;
use std::fs::File;
use std::io::{self, Seek, SeekFrom, Write};
use std::path::Path;
use std::time::Duration;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    pub name: String,
    pub is_default: bool,
}

struct Voice {
    main: Player,
    monitor: Option<Player>,
    /// Per-sound volume, before master volume is applied.
    volume: f32,
}

/// Output stream(s) and the sounds currently playing.
/// Each sound gets its own `Player` per output, so sounds overlap.
pub struct Engine {
    sink: Option<MixerDeviceSink>,
    /// Name of the chosen primary device; `None` means system default.
    primary_name: Option<String>,
    monitor_sink: Option<MixerDeviceSink>,
    monitor_name: Option<String>,
    monitor_gain: f32,
    voices: Vec<Voice>,
    master: f32,
}

impl Engine {
    pub fn new() -> Self {
        Self {
            sink: None,
            primary_name: None,
            monitor_sink: None,
            monitor_name: None,
            monitor_gain: 1.0,
            voices: Vec::new(),
            master: 1.0,
        }
    }

    pub fn list_devices() -> Result<Vec<DeviceInfo>, String> {
        let host = cpal::default_host();
        let default = host.default_output_device().map(|d| d.id());
        let devices = host.output_devices().map_err(|e| e.to_string())?;
        Ok(devices
            .map(|d| DeviceInfo { name: device_name(&d), is_default: Some(d.id()) == default })
            .collect())
    }

    /// `None` selects the system default output. Stops current playback.
    pub fn set_device(&mut self, name: Option<&str>) -> Result<(), String> {
        let chosen = name.map(str::to_string).or_else(default_device_name);
        if chosen.is_some() && chosen == self.monitor_name {
            return Err("primary and monitor output must differ".to_string());
        }
        let sink = open(name)?;
        self.voices.clear();
        self.sink = Some(sink);
        self.primary_name = name.map(str::to_string);
        Ok(())
    }

    /// `None` turns monitoring off. Monitor must differ from the primary output.
    pub fn set_monitor(&mut self, name: Option<&str>) -> Result<(), String> {
        match name {
            None => {
                self.monitor_sink = None;
                self.monitor_name = None;
                for v in &mut self.voices {
                    v.monitor = None;
                }
                Ok(())
            }
            Some(wanted) => {
                let primary = self.primary_name.clone().or_else(default_device_name);
                if primary.as_deref() == Some(wanted) {
                    return Err("monitor and primary output must differ".to_string());
                }
                let sink = open(Some(wanted))?;
                self.monitor_sink = Some(sink);
                self.monitor_name = Some(wanted.to_string());
                Ok(())
            }
        }
    }

    pub fn set_monitor_gain(&mut self, gain: f32) {
        self.monitor_gain = gain.clamp(0.0, 2.0);
        self.apply_volumes();
    }

    pub fn play(&mut self, path: &Path, meta: &SoundMeta) -> Result<(), String> {
        let (start, take) = trim_window(meta.trim_start, meta.trim_end)?;
        let volume = meta.volume.unwrap_or(1.0).clamp(0.0, 2.0);

        if self.sink.is_none() {
            self.sink = Some(open(None)?);
        }
        let main_sink = self.sink.as_ref().ok_or("no output stream")?;
        let main = spawn(main_sink, path, start, take)?;
        let monitor = match &self.monitor_sink {
            Some(sink) => Some(spawn(sink, path, start, take)?),
            None => None,
        };

        self.voices.retain(|v| !v.main.empty());
        self.voices.push(Voice { main, monitor, volume });
        self.apply_volumes();
        Ok(())
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
            v.main.set_volume(v.volume * self.master);
            if let Some(m) = &v.monitor {
                m.set_volume(v.volume * self.master * self.monitor_gain);
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

/// Name of the system default output, if any.
pub fn default_device_name() -> Option<String> {
    cpal::default_host().default_output_device().map(|d| device_name(&d))
}

fn device_name(device: &cpal::Device) -> String {
    device.description().map_or("unknown".to_string(), |d| d.name().to_string())
}

fn open(name: Option<&str>) -> Result<MixerDeviceSink, String> {
    let host = cpal::default_host();
    let device = match name {
        Some(wanted) => host
            .output_devices()
            .map_err(|e| e.to_string())?
            .find(|d| device_name(d) == wanted)
            .ok_or_else(|| format!("output device not found: {wanted}"))?,
        None => host.default_output_device().ok_or("no default output device")?,
    };
    DeviceSinkBuilder::from_device(device)
        .and_then(|b| b.open_stream())
        .map_err(|e| format!("open output device: {e}"))
}

/// Trim in seconds from the file start. Returns the start to skip and, if an end is set,
/// the length to play from that start.
pub fn trim_window(start: Option<f64>, end: Option<f64>) -> Result<(Duration, Option<Duration>), String> {
    let start = start.unwrap_or(0.0);
    if !start.is_finite() || start < 0.0 {
        return Err(format!("invalid trim start: {start}"));
    }
    match end {
        None => Ok((Duration::from_secs_f64(start), None)),
        Some(end) => {
            if !end.is_finite() || end <= start {
                return Err(format!("trim end {end} must be after start {start}"));
            }
            Ok((Duration::from_secs_f64(start), Some(Duration::from_secs_f64(end - start))))
        }
    }
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

fn wav_header(channels: u16, rate: u32, data_len: u32) -> [u8; 44] {
    let mut h = [0u8; 44];
    h[0..4].copy_from_slice(b"RIFF");
    h[4..8].copy_from_slice(&(36 + data_len).to_le_bytes());
    h[8..12].copy_from_slice(b"WAVE");
    h[12..16].copy_from_slice(b"fmt ");
    h[16..20].copy_from_slice(&16u32.to_le_bytes());
    h[20..22].copy_from_slice(&1u16.to_le_bytes()); // PCM
    h[22..24].copy_from_slice(&channels.to_le_bytes());
    h[24..28].copy_from_slice(&rate.to_le_bytes());
    h[28..32].copy_from_slice(&(rate * channels as u32 * 2).to_le_bytes());
    h[32..34].copy_from_slice(&(channels * 2).to_le_bytes());
    h[34..36].copy_from_slice(&16u16.to_le_bytes());
    h[36..40].copy_from_slice(b"data");
    h[40..44].copy_from_slice(&data_len.to_le_bytes());
    h
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trim_window_cases() {
        assert_eq!(trim_window(None, None).unwrap(), (Duration::ZERO, None));
        assert_eq!(
            trim_window(Some(1.0), Some(3.5)).unwrap(),
            (Duration::from_secs(1), Some(Duration::from_millis(2500)))
        );
        assert!(trim_window(Some(2.0), Some(2.0)).is_err());
        assert!(trim_window(Some(-1.0), None).is_err());
        assert!(trim_window(Some(f64::NAN), None).is_err());
    }
}
