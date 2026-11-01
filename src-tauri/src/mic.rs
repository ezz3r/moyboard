//! Mode B microphone capture. The mic runs into a ring buffer; a rodio source on the cable's
//! mixer pulls from it, so the mic and the sounds leave through the same output stream.

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, Sample, SampleFormat, SizedSample, StreamConfig};
use moyboard_core::mic::{Drift, drift_action};
use rodio::mixer::Mixer;
use rodio::{ChannelCount, SampleRate, Source};
use std::num::NonZero;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering::Relaxed};
use std::time::Duration;

/// Shown when the saved microphone (or cable recording side) is no longer connected.
pub const MIC_MISSING: &str = "Microphone not found. Choose a microphone in Settings.";

/// A running capture. Dropping it stops the stream and ends its source in the mixer.
pub struct Mic {
    _stream: cpal::Stream,
    stop: Arc<AtomicBool>,
    /// Set by the stream's error callback, e.g. when the device is unplugged.
    failed: Arc<AtomicBool>,
    /// Gain as `f32` bits, applied in the mixer source.
    gain: Arc<AtomicU32>,
    /// Peak of the captured signal since the last `level` call, `f32` bits.
    peak: Arc<AtomicU32>,
}

impl Mic {
    /// Opens the microphone `id` (`None` = Windows default) and adds it to `mixer`.
    pub fn start(id: Option<&str>, mixer: &Mixer, gain: f32) -> Result<Self, String> {
        let device = find_input(id)?;
        let supported = device.default_input_config().map_err(|e| format!("microphone: {e}"))?;
        let config = supported.config();
        let rate = NonZero::new(config.sample_rate).ok_or("microphone reports rate 0")?;

        // One second of room. The mixer side keeps it near 10–60 ms (see `drift_action`).
        let (mut prod, cons) = rtrb::RingBuffer::<f32>::new(rate.get() as usize);
        let failed = Arc::new(AtomicBool::new(false));
        let peak = Arc::new(AtomicU32::new(0));
        let peak_cb = peak.clone();
        let stream = open_input(&device, &config, supported.sample_format(), failed.clone(), move |v| {
            // A full buffer drops the newest sample; the drift rule keeps this rare.
            let _ = prod.push(v);
            track_peak(&peak_cb, v);
        })?;
        stream.play().map_err(|e| format!("start microphone: {e}"))?;

        let stop = Arc::new(AtomicBool::new(false));
        let gain = Arc::new(AtomicU32::new(gain.clamp(0.0, 2.0).to_bits()));
        mixer.add(MicSource {
            cons,
            stop: stop.clone(),
            gain: gain.clone(),
            rate,
            channels: NonZero::new(1).unwrap(),
        });
        Ok(Self { _stream: stream, stop, failed, gain, peak })
    }

    pub fn failed(&self) -> bool {
        self.failed.load(Relaxed)
    }

    pub fn set_gain(&self, gain: f32) {
        self.gain.store(gain.clamp(0.0, 2.0).to_bits(), Relaxed);
    }

    /// Peak level since the last call, 0..=1 (may exceed 1 when clipping). Resets the peak.
    pub fn level(&self) -> f32 {
        f32::from_bits(self.peak.swap(0f32.to_bits(), Relaxed))
    }
}

impl Drop for Mic {
    fn drop(&mut self) {
        self.stop.store(true, Relaxed);
    }
}

/// Peak of recording endpoint `id` over `duration`. The cable test plays a tone into the cable
/// and checks that it arrives here. Blocks for `duration`: call it off the UI thread.
pub fn peak_of(id: &str, duration: Duration) -> Result<f32, String> {
    let device = find_input(Some(id))?;
    let supported = device.default_input_config().map_err(|e| format!("recording side: {e}"))?;
    let peak = Arc::new(AtomicU32::new(0));
    let peak_cb = peak.clone();
    let stream = open_input(
        &device,
        &supported.config(),
        supported.sample_format(),
        Arc::new(AtomicBool::new(false)),
        move |v| track_peak(&peak_cb, v),
    )?;
    stream.play().map_err(|e| format!("listen on recording side: {e}"))?;
    std::thread::sleep(duration);
    drop(stream);
    Ok(f32::from_bits(peak.load(Relaxed)))
}

fn track_peak(peak: &AtomicU32, v: f32) {
    if v.abs() > f32::from_bits(peak.load(Relaxed)) {
        peak.store(v.abs().to_bits(), Relaxed);
    }
}

fn find_input(id: Option<&str>) -> Result<cpal::Device, String> {
    let host = cpal::default_host();
    match id {
        Some(wanted) => wanted
            .parse::<cpal::DeviceId>()
            .ok()
            .and_then(|parsed| host.device_by_id(&parsed))
            .ok_or_else(|| MIC_MISSING.to_string()),
        None => host.default_input_device().ok_or_else(|| "no default microphone".to_string()),
    }
}

/// Input stream that hands each mono sample (channels averaged) to `on_sample`.
fn open_input(
    device: &cpal::Device,
    config: &StreamConfig,
    format: SampleFormat,
    failed: Arc<AtomicBool>,
    on_sample: impl FnMut(f32) + Send + 'static,
) -> Result<cpal::Stream, String> {
    match format {
        SampleFormat::F32 => build::<f32>(device, config, failed, on_sample),
        SampleFormat::I16 => build::<i16>(device, config, failed, on_sample),
        other => Err(format!("unsupported microphone sample format: {other:?}")),
    }
}

fn build<T>(
    device: &cpal::Device,
    config: &StreamConfig,
    failed: Arc<AtomicBool>,
    mut on_sample: impl FnMut(f32) + Send + 'static,
) -> Result<cpal::Stream, String>
where
    T: SizedSample,
    f32: FromSample<T>,
{
    let channels = config.channels as usize;
    device
        .build_input_stream::<T, _, _>(
            config.clone(),
            move |data, _| {
                for frame in data.chunks_exact(channels) {
                    // Mono mean without allocating: this runs on the audio thread.
                    let v = frame.iter().map(|s| f32::from_sample(*s)).sum::<f32>() / channels as f32;
                    on_sample(v);
                }
            },
            move |e| {
                failed.store(true, Relaxed);
                eprintln!("moyboard: microphone stream: {e}");
            },
            None,
        )
        .map_err(|e| format!("open microphone: {e}"))
}

/// Pulls mic samples into the mixer. Silence on underrun, one sample skipped on overrun.
struct MicSource {
    cons: rtrb::Consumer<f32>,
    stop: Arc<AtomicBool>,
    gain: Arc<AtomicU32>,
    rate: SampleRate,
    channels: ChannelCount,
}

impl Iterator for MicSource {
    type Item = f32;

    fn next(&mut self) -> Option<f32> {
        if self.stop.load(Relaxed) {
            return None;
        }
        let v = match drift_action(self.cons.slots(), self.rate.get()) {
            Drift::Silence => 0.0,
            Drift::Keep => self.cons.pop().unwrap_or(0.0),
            Drift::Drop => {
                let _ = self.cons.pop();
                self.cons.pop().unwrap_or(0.0)
            }
        };
        Some(v * f32::from_bits(self.gain.load(Relaxed)))
    }
}

impl Source for MicSource {
    fn current_span_len(&self) -> Option<usize> {
        None
    }

    fn channels(&self) -> ChannelCount {
        self.channels
    }

    fn sample_rate(&self) -> SampleRate {
        self.rate
    }

    fn total_duration(&self) -> Option<Duration> {
        None
    }
}
