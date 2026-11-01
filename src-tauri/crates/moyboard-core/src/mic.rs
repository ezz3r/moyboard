//! Pure rules for the Mode B microphone path. No audio types here, so it runs on Linux.

/// The mic ring buffer is kept between these fill levels (in ms of audio).
pub const FILL_MIN_MS: usize = 10;
pub const FILL_MAX_MS: usize = 60;

/// What the mixer does with the mic buffer before it hands out the next sample.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Drift {
    /// Fill is in range: play the next sample.
    Keep,
    /// Mic clock runs faster than the output: skip one sample to shorten the lag.
    Drop,
    /// Mic clock runs slower (or the mic stalled): play silence once, so the buffer refills.
    Silence,
}

/// Compares the buffered sample count with the target window at `rate` Hz.
// shortcut: one sample per callback is a coarse clock-drift fix, upgrade to a resampler if crackling shows up in the 30+ min Windows test
pub fn drift_action(fill: usize, rate: u32) -> Drift {
    let min = rate as usize * FILL_MIN_MS / 1000;
    let max = rate as usize * FILL_MAX_MS / 1000;
    if fill > max {
        Drift::Drop
    } else if fill < min {
        Drift::Silence
    } else {
        Drift::Keep
    }
}

/// Mean of one interleaved frame's samples. Mono is enough for voice and keeps the mixer simple.
pub fn mono_mean(frame: &[f32]) -> f32 {
    if frame.is_empty() {
        return 0.0;
    }
    frame.iter().sum::<f32>() / frame.len() as f32
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn drift_window_at_48k() {
        // 10 ms = 480 samples, 60 ms = 2880 samples.
        assert_eq!(drift_action(100, 48_000), Drift::Silence);
        assert_eq!(drift_action(480, 48_000), Drift::Keep);
        assert_eq!(drift_action(2880, 48_000), Drift::Keep);
        assert_eq!(drift_action(2881, 48_000), Drift::Drop);
    }

    #[test]
    fn drift_window_scales_with_rate() {
        assert_eq!(drift_action(440, 44_100), Drift::Silence);
        assert_eq!(drift_action(441, 44_100), Drift::Keep);
        assert_eq!(drift_action(2646, 44_100), Drift::Keep);
        assert_eq!(drift_action(2647, 44_100), Drift::Drop);
    }

    #[test]
    fn mono_mean_averages_channels() {
        assert_eq!(mono_mean(&[0.5, -0.5]), 0.0);
        assert_eq!(mono_mean(&[0.2, 0.4, 0.6]), 0.4);
        assert_eq!(mono_mean(&[]), 0.0);
    }
}
