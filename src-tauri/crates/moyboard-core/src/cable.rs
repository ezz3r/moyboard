//! Virtual cable detection by device name. Pure logic: the audio layer passes in the endpoints.
//!
//! A cable has a playback side (apps write into it) and a recording side (Discord reads it).
//! Known drivers name both sides so the recording name can be derived from the playback name.

use serde::Serialize;

/// One audio endpoint as the audio layer reports it. `id` is the stable endpoint ID.
#[derive(Clone, Debug, PartialEq)]
pub struct Endpoint {
    pub id: String,
    pub name: String,
}

/// A playback side and its recording side, both present on this machine.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CablePair {
    pub playback_id: String,
    pub playback_name: String,
    pub record_id: String,
    pub record_name: String,
}

/// Name patterns of known virtual audio devices. Wave Link is detected but has no cable pair.
pub fn is_virtual_name(name: &str) -> bool {
    ["CABLE Input", "CABLE Output", "VoiceMeeter", "Virtual Audio Cable", "Wave Link"]
        .iter()
        .any(|pattern| name.contains(pattern))
}

/// Recording-side name for a playback-side name, when the driver names the two sides as a pair.
/// `CABLE Input (VB-Audio Virtual Cable)` gives `CABLE Output (VB-Audio Virtual Cable)`.
/// `Line 1 (Virtual Audio Cable)` has the same name on both sides. Other names give `None`.
pub fn paired_record_name(playback: &str) -> Option<String> {
    if playback.contains("CABLE Input") || (playback.contains("VoiceMeeter") && playback.contains("Input")) {
        return Some(playback.replacen("Input", "Output", 1));
    }
    if playback.contains("Virtual Audio Cable") {
        return Some(playback.to_string());
    }
    None
}

/// The first virtual playback endpoint whose recording side is also present.
pub fn find_cable(playback: &[Endpoint], record: &[Endpoint]) -> Option<CablePair> {
    playback
        .iter()
        .filter(|p| is_virtual_name(&p.name))
        .find_map(|p| {
            let want = paired_record_name(&p.name)?;
            let r = record.iter().find(|r| r.name == want)?;
            Some(pair(p, r))
        })
}

/// A pair the user chose by ID (for cables without a known name pair). `None` when either side
/// is gone, so the caller can show a missing-cable message.
pub fn check_pair(
    playback: &[Endpoint],
    record: &[Endpoint],
    playback_id: &str,
    record_id: &str,
) -> Option<CablePair> {
    let p = playback.iter().find(|p| p.id == playback_id)?;
    let r = record.iter().find(|r| r.id == record_id)?;
    Some(pair(p, r))
}

fn pair(p: &Endpoint, r: &Endpoint) -> CablePair {
    CablePair {
        playback_id: p.id.clone(),
        playback_name: p.name.clone(),
        record_id: r.id.clone(),
        record_name: r.name.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ep(id: &str, name: &str) -> Endpoint {
        Endpoint { id: id.into(), name: name.into() }
    }

    #[test]
    fn recording_name_for_known_drivers() {
        assert_eq!(
            paired_record_name("CABLE Input (VB-Audio Virtual Cable)").as_deref(),
            Some("CABLE Output (VB-Audio Virtual Cable)")
        );
        assert_eq!(
            paired_record_name("VoiceMeeter Aux Input (VB-Audio VoiceMeeter AUX VAIO)").as_deref(),
            Some("VoiceMeeter Aux Output (VB-Audio VoiceMeeter AUX VAIO)")
        );
        assert_eq!(
            paired_record_name("Line 1 (Virtual Audio Cable)").as_deref(),
            Some("Line 1 (Virtual Audio Cable)")
        );
        assert_eq!(paired_record_name("Wave Link Stream 1"), None);
        assert_eq!(paired_record_name("Speakers (Realtek)"), None);
    }

    #[test]
    fn virtual_name_patterns() {
        assert!(is_virtual_name("CABLE Input (VB-Audio Virtual Cable)"));
        assert!(is_virtual_name("VoiceMeeter Input (VB-Audio VoiceMeeter VAIO)"));
        assert!(is_virtual_name("Wave Link Stream"));
        assert!(!is_virtual_name("Headphones (USB Audio)"));
    }

    #[test]
    fn finds_cable_when_both_sides_present() {
        let out = [ep("p1", "Speakers (Realtek)"), ep("p2", "CABLE Input (VB-Audio Virtual Cable)")];
        let inp = [ep("r1", "Microphone (USB)"), ep("r2", "CABLE Output (VB-Audio Virtual Cable)")];
        let found = find_cable(&out, &inp).expect("pair");
        assert_eq!(found.playback_id, "p2");
        assert_eq!(found.record_id, "r2");
        assert_eq!(found.record_name, "CABLE Output (VB-Audio Virtual Cable)");
    }

    #[test]
    fn playback_side_alone_is_not_a_cable() {
        let out = [ep("p2", "CABLE Input (VB-Audio Virtual Cable)")];
        let inp = [ep("r1", "Microphone (USB)")];
        assert_eq!(find_cable(&out, &inp), None);
    }

    #[test]
    fn wave_link_has_no_pair() {
        let out = [ep("p3", "Wave Link Stream 1")];
        let inp = [ep("r3", "Wave Link Stream 1")];
        assert_eq!(find_cable(&out, &inp), None);
    }

    #[test]
    fn saved_pair_must_still_exist() {
        let out = [ep("p2", "Line 2 (Virtual Audio Cable)")];
        let inp = [ep("r2", "Line 2 (Virtual Audio Cable)")];
        assert!(check_pair(&out, &inp, "p2", "r2").is_some());
        assert_eq!(check_pair(&out, &inp, "p2", "gone"), None);
        assert_eq!(check_pair(&out, &inp, "gone", "r2"), None);
    }
}
