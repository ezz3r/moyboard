import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { AudioMode, CablePair, MicStatus, OutputDevice, RoutingState } from "../types";
import { Select } from "./Select";

type Props = {
  routing: RoutingState;
  outputs: OutputDevice[];
  onRoutingChanged: (next: RoutingState) => void;
  onOpenGuide: () => void | Promise<void>;
  onError: (message: string) => void;
};

const NO_MIC: MicStatus = { active: false, running: false, error: null };
const VB_CABLE_URL = "https://vb-audio.com/Cable/";

/** Settings → Audio routing: Mode A (sounds only) or Mode B (mic and sounds into a virtual cable). */
export function AudioRouting({ routing, outputs, onRoutingChanged, onOpenGuide, onError }: Props) {
  const [inputs, setInputs] = useState<OutputDevice[]>([]);
  const [cable, setCable] = useState<CablePair | null>(null);
  const [mic, setMic] = useState<MicStatus>(NO_MIC);
  const [level, setLevel] = useState(0);
  const [playback, setPlayback] = useState(routing.cablePlayback ?? "");
  const [record, setRecord] = useState(routing.cableRecord ?? "");
  const [micId, setMicId] = useState(routing.micId ?? "");
  const [micVolume, setMicVolume] = useState(routing.micVolume);
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const mix = routing.mode === "mix";

  // Cable, mic and device list are only needed in Mode B. Polled while the section is visible.
  const refreshStatus = useCallback(async () => {
    if (document.hidden) return;
    try {
      const [found, status, devices] = await Promise.all([
        api.detectCable(),
        api.getMicStatus(),
        api.listInputDevices(),
      ]);
      setCable(found);
      setMic(status);
      setInputs(devices);
    } catch (e) {
      onError(String(e));
    }
  }, [onError]);

  useEffect(() => {
    if (!mix) return;
    void refreshStatus();
    const timer = setInterval(() => void refreshStatus(), 2000);
    return () => clearInterval(timer);
  }, [mix, refreshStatus]);

  // Level meter: about 10 updates per second, only while a mic is running in Mode B.
  useEffect(() => {
    if (!mix || !mic.running) {
      setLevel(0);
      return;
    }
    const timer = setInterval(() => {
      if (document.hidden) return;
      api.getMicLevel().then(setLevel).catch((e) => onError(String(e)));
    }, 100);
    return () => clearInterval(timer);
  }, [mix, mic.running, onError]);

  // Without a saved pair, prefill the cable that was detected.
  useEffect(() => {
    if (!routing.cablePlayback && cable) {
      setPlayback(cable.playbackId);
      setRecord(cable.recordId);
    }
  }, [cable, routing.cablePlayback]);

  const setMode = async (next: AudioMode) => {
    if (next === routing.mode) return;
    try {
      await api.setAudioMode(next);
      onRoutingChanged({ ...routing, mode: next });
    } catch (e) {
      onError(String(e));
    }
  };

  const saveCable = async () => {
    try {
      await api.setCable(playback, record);
      onRoutingChanged({ ...routing, cablePlayback: playback, cableRecord: record });
    } catch (e) {
      onError(String(e));
    }
  };

  const saveMic = async (id: string) => {
    setMicId(id);
    try {
      await api.setMicDevice(id || null);
      onRoutingChanged({ ...routing, micId: id || null });
      void refreshStatus();
    } catch (e) {
      onError(String(e));
    }
  };

  const saveMicVolume = async (volume: number) => {
    setMicVolume(volume);
    try {
      await api.setMicVolume(volume);
      onRoutingChanged({ ...routing, micVolume: volume });
    } catch (e) {
      onError(String(e));
    }
  };

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    try {
      await api.testCable();
      setTest({ ok: true, text: `Sound arrived on ${savedRecordName ?? "the recording side"}. Discord can hear moyboard.` });
    } catch (e) {
      setTest({ ok: false, text: String(e) });
    } finally {
      setTesting(false);
    }
  };

  const openExternal = (url: string) => api.openUrl(url).catch((e) => onError(String(e)));

  const savedRecordName = inputs.find((d) => d.id === routing.cableRecord)?.name ?? cable?.recordName ?? null;
  // The cable's own recording side is never offered as a microphone: that would feed back.
  const micChoices = inputs.filter((d) => d.id !== (cable?.recordId ?? routing.cableRecord));
  const micDenied = mic.error !== null && !mic.error.includes("not found");

  return (
    <>
      <div className="segmented" role="radiogroup" aria-label="Audio mode">
        <button
          type="button"
          role="radio"
          aria-checked={!mix}
          className={`segment${!mix ? " on" : ""}`}
          onClick={() => void setMode("sounds")}
        >
          Sounds only
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={mix}
          className={`segment${mix ? " on" : ""}`}
          onClick={() => void setMode("mix")}
        >
          Mic and sounds
        </button>
      </div>

      {!mix ? (
        <>
          <p className="hint">
            Sounds only: moyboard plays sounds to the output chosen under For others. Use this when your mixer (Wave
            Link, VoiceMeeter) already adds your microphone. In Discord, pick the input your mixer provides.
          </p>
          <div className="step-actions">
            <button type="button" className="btn" onClick={onOpenGuide}>
              Setup guide
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="hint">
            Mic and sounds: moyboard mixes your microphone and sounds into a virtual cable. Discord reads the cable.
            moyboard must be running, or Discord hears silence.
          </p>

          <ol className="steps">
            <li>
              <p className="step-title">1. Virtual cable</p>
              {cable ? (
                <p className="status ok" role="status">
                  Detected: {cable.playbackName} / {cable.recordName}
                </p>
              ) : (
                <div className="hint-box" role="note">
                  <p>No virtual cable found. Install VB-CABLE, restart Windows, then press Refresh.</p>
                  <div className="step-actions">
                    <button type="button" className="btn" onClick={() => void openExternal(VB_CABLE_URL)}>
                      Open VB-Audio website
                    </button>
                    <button type="button" className="btn" onClick={() => void refreshStatus()}>
                      Refresh
                    </button>
                  </div>
                </div>
              )}
              <div className="cable-pick">
                <Select
                  aria-label="Playback side (moyboard writes here)"
                  value={playback}
                  options={[
                    { value: "", label: "Choose a playback device" },
                    ...outputs.map((d) => ({ value: d.id, label: d.name })),
                  ]}
                  onChange={setPlayback}
                />
                <Select
                  aria-label="Recording side (Discord reads here)"
                  value={record}
                  options={[
                    { value: "", label: "Choose a recording device" },
                    ...inputs.map((d) => ({ value: d.id, label: d.name })),
                  ]}
                  onChange={setRecord}
                />
              </div>
              <div className="step-actions">
                <button type="button" className="btn" disabled={!playback || !record} onClick={() => void saveCable()}>
                  Use this cable
                </button>
                <button type="button" className="btn" onClick={onOpenGuide}>
                  Setup guide
                </button>
              </div>
            </li>

            <li>
              <p className="step-title">2. Microphone</p>
              <Select
                aria-label="Microphone"
                value={micId}
                options={[
                  { value: "", label: "Windows default microphone" },
                  ...micChoices.map((d) => ({ value: d.id, label: d.name })),
                ]}
                onChange={(v) => void saveMic(v)}
              />
              <div
                className="meter"
                role="meter"
                aria-label="Microphone level"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(Math.min(level, 1) * 100)}
              >
                <span style={{ width: `${Math.min(level, 1) * 100}%` }} />
              </div>
              <label className="slider-row">
                <span>Microphone volume</span>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.05}
                  value={micVolume}
                  aria-label="Microphone volume"
                  onChange={(e) => void saveMicVolume(Number(e.target.value))}
                />
                <span className="slider-value">{Math.round(micVolume * 100)}%</span>
              </label>
              {mic.running ? (
                <p className="status ok" role="status">
                  Mic routing active.
                </p>
              ) : mic.error ? (
                <div className="hint-box" role="alert">
                  <p className="status alarm">{mic.error}</p>
                  {micDenied && (
                    <div className="step-actions">
                      <button type="button" className="btn" onClick={() => void api.openMicPrivacy().catch((e) => onError(String(e)))}>
                        Open microphone privacy settings
                      </button>
                    </div>
                  )}
                </div>
              ) : null}
            </li>

            <li>
              <p className="step-title">3. Discord input</p>
              <p className="hint">
                Discord → Voice &amp; Video → Input Device → <strong>{savedRecordName ?? "the recording side of your cable"}</strong>
              </p>
              <p className="hint">
                Do not pick the playback side in Discord, and do not set the cable as the Windows default device.
              </p>
            </li>

            <li>
              <p className="step-title">4. Test</p>
              <div className="step-actions">
                <button type="button" className="btn" disabled={testing || !routing.cableRecord} onClick={() => void runTest()}>
                  {testing ? "Testing…" : "Test cable"}
                </button>
              </div>
              {test && (
                <p className={`status ${test.ok ? "ok" : "alarm"}`} role="status">
                  {test.text}
                </p>
              )}
            </li>
          </ol>
        </>
      )}

      <details className="help">
        <summary>Setup help</summary>
        <h3>I already have a virtual cable or mixer</h3>
        <ul>
          <li>
            Mixer adds your mic (Wave Link, VoiceMeeter): choose <strong>Sounds only</strong>, pick the mixer's virtual
            output under For others, and select its input in Discord.
          </li>
          <li>
            Plain cable (VB-CABLE, Virtual Audio Cable): choose <strong>Mic and sounds</strong>, select the cable's
            playback side and your microphone, then select the cable's recording side in Discord.
          </li>
        </ul>
        <h3>I have no virtual cable (mic only)</h3>
        <ol>
          <li>
            Download VB-CABLE from <button type="button" className="link" onClick={() => void openExternal(VB_CABLE_URL)}>vb-audio.com/Cable</button>. It is donationware: please consider supporting the author.
          </li>
          <li>Extract the archive, run the setup as administrator, and restart Windows if asked.</li>
          <li>Here choose <strong>Mic and sounds</strong>, select the cable and your microphone, then press Test cable.</li>
          <li>In Discord choose Voice &amp; Video → Input Device → <strong>CABLE Output</strong>.</li>
        </ol>
      </details>
    </>
  );
}
