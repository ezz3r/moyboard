//! Pure helpers for trimming and WAV output. No audio device needed.

use std::time::Duration;

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


pub fn wav_header(channels: u16, rate: u32, data_len: u32) -> [u8; 44] {
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

    #[test]
    fn wav_header_fields() {
        let h = wav_header(2, 44100, 1000);
        assert_eq!(&h[0..4], b"RIFF");
        assert_eq!(u32::from_le_bytes(h[4..8].try_into().unwrap()), 1036);
        assert_eq!(&h[8..16], b"WAVEfmt ");
        assert_eq!(u16::from_le_bytes(h[22..24].try_into().unwrap()), 2);
        assert_eq!(u32::from_le_bytes(h[24..28].try_into().unwrap()), 44100);
        assert_eq!(u32::from_le_bytes(h[28..32].try_into().unwrap()), 44100 * 2 * 2);
        assert_eq!(u16::from_le_bytes(h[32..34].try_into().unwrap()), 4);
        assert_eq!(&h[36..40], b"data");
        assert_eq!(u32::from_le_bytes(h[40..44].try_into().unwrap()), 1000);
    }
}
