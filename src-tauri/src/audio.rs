use crate::config::SoundMeta;
use cpal::traits::{DeviceTrait, HostTrait};
use rodio::{Decoder, DeviceSinkBuilder, MixerDeviceSink, Player, Source};
use serde::Serialize;
use std::fs::File;
use std::path::Path;
use std::time::Duration;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    pub name: String,
    pub is_default: bool,
}

struct Voice {
    player: Player,
    /// Per-sound volume, before master volume is applied.
    volume: f32,
}

/// Owns the output stream and the sounds currently playing.
/// Each sound gets its own `Player`, so sounds overlap.
pub struct Engine {
    sink: Option<MixerDeviceSink>,
    voices: Vec<Voice>,
    master: f32,
}

impl Engine {
    pub fn new() -> Self {
        Self { sink: None, voices: Vec::new(), master: 1.0 }
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
        let sink = open(name)?;
        self.voices.clear();
        self.sink = Some(sink);
        Ok(())
    }

    pub fn play(&mut self, path: &Path, meta: &SoundMeta) -> Result<(), String> {
        let (start, take) = trim_window(meta.trim_start, meta.trim_end)?;
        let file = File::open(path).map_err(|e| format!("open {}: {e}", path.display()))?;
        let decoder = Decoder::try_from(file).map_err(|e| format!("decode {}: {e}", path.display()))?;

        if self.sink.is_none() {
            self.sink = Some(open(None)?);
        }
        let mixer = self.sink.as_ref().map(|s| s.mixer()).ok_or("no output stream")?;
        let player = Player::connect_new(mixer);

        let volume = meta.volume.unwrap_or(1.0).clamp(0.0, 2.0);
        player.set_volume(volume * self.master);
        match take {
            Some(take) => player.append(decoder.skip_duration(start).take_duration(take)),
            None => player.append(decoder.skip_duration(start)),
        }

        self.voices.retain(|v| !v.player.empty());
        self.voices.push(Voice { player, volume });
        Ok(())
    }

    pub fn stop_all(&mut self) {
        for voice in self.voices.drain(..) {
            voice.player.stop();
        }
    }

    pub fn set_master(&mut self, master: f32) {
        self.master = master.clamp(0.0, 2.0);
        for voice in &self.voices {
            voice.player.set_volume(voice.volume * self.master);
        }
    }
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
