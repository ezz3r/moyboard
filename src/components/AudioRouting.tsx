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

/** Settings → Audio routing: Sounds only (Mode A) or Mic and sounds (Mode B). */
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

  const openExternal = (url: string) => api.openUrl(url).catch((e) => onError(String(e)));

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    try {
      await api.testCable();
      setTest({ ok: true, text: `Sound arrived on ${recordName}. Your app can hear moyboard.` });
    } catch (e) {
      setTest({ ok: false, text: String(e) });
    } finally {
      setTesting(false);
    }
  };

  const recordName = inputs.find((d) => d.id === routing.cableRecord)?.name ?? cable?.recordName ?? "the cable's recording side";
  // The cable's own recording side is never offered as a microphone: that would feed back.
  const micChoices = inputs.filter((d) => d.id !== (cable?.recordId ?? routing.cableRecord));
  const micDenied = mic.error !== null && !mic.error.includes("not found");

  // One line that says what is missing, so the user does not have to read every card.
  const status = !mix
    ? null
    : !cable
      ? { ok: false, text: "No virtual cable found" }
      : mic.error
        ? { ok: false, text: "Microphone unavailable" }
        : mic.running
          ? { ok: true, text: "Ready. Keep moyboard running." }
          : { ok: false, text: "Microphone starting…" };

  return (
    <div className="routing">
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
        <div className="routing-card">
          <p className="hint">
            Sounds go to the output chosen under For others. Use this when a mixer (Wave Link, VoiceMeeter) already
            adds your microphone. Select the mixer's virtual input in your app.
          </p>
          <div className="step-actions">
            <button type="button" className="btn" onClick={onOpenGuide}>
              Setup guide
            </button>
          </div>
        </div>
      ) : (
        <>
          {status && (
            <p className={`routing-status ${status.ok ? "ok" : "alarm"}`} role="status">
              {status.text}
            </p>
          )}

          <section className="routing-card" aria-labelledby="routing-cable">
            <h3 id="routing-cable">Virtual cable</h3>
            {cable && (
              <p className="status ok" role="status">
                Detected: {cable.playbackName} / {cable.recordName}
              </p>
            )}
            {!cable && (
              <div className="hint-box" role="note">
                <p>Install VB-CABLE, restart Windows, then press Refresh.</p>
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
            <div className="routing-fields">
              <label className="field">
                <span className="field-label">Playback (moyboard writes here)</span>
                <Select
                  aria-label="Playback side (moyboard writes here)"
                  value={playback}
                  options={[
                    { value: "", label: "Choose a playback device" },
                    ...outputs.map((d) => ({ value: d.id, label: d.name })),
                  ]}
                  onChange={setPlayback}
                />
              </label>
              <label className="field">
                <span className="field-label">Recording (your app reads here)</span>
                <Select
                  aria-label="Recording side (your app reads here)"
                  value={record}
                  options={[
                    { value: "", label: "Choose a recording device" },
                    ...inputs.map((d) => ({ value: d.id, label: d.name })),
                  ]}
                  onChange={setRecord}
                />
              </label>
            </div>
            <div className="step-actions">
              <button type="button" className="btn" disabled={!playback || !record} onClick={() => void saveCable()}>
                Use this cable
              </button>
              <button type="button" className="btn" onClick={onOpenGuide}>
                Setup guide
              </button>
            </div>
          </section>

          <section className="routing-card" aria-labelledby="routing-mic">
            <h3 id="routing-mic">Microphone</h3>
            <label className="field">
              <span className="field-label">Input</span>
              <Select
                aria-label="Microphone"
                value={micId}
                options={[
                  { value: "", label: "Windows default microphone" },
                  ...micChoices.map((d) => ({ value: d.id, label: d.name })),
                ]}
                onChange={(v) => void saveMic(v)}
              />
            </label>
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
              <span>Volume</span>
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
            {mic.error && (
              <div className="hint-box" role="alert">
                <p className="status alarm">{mic.error}</p>
                {micDenied && (
                  <div className="step-actions">
                    <button
                      type="button"
                      className="btn"
                      onClick={() => void api.openMicPrivacy().catch((e) => onError(String(e)))}
                    >
                      Open microphone privacy settings
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="routing-card" aria-labelledby="routing-test">
            <h3 id="routing-test">Test</h3>
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
            <p className="hint">
              In your app, set the input to <strong>{recordName}</strong>. Do not choose the playback side, and do not
              set the cable as the Windows default device.
            </p>
          </section>
        </>
      )}

      <details className="help">
        <summary>Setup help</summary>
        <h3>I already have a virtual cable or mixer</h3>
        <ul>
          <li>
            Mixer adds your mic (Wave Link, VoiceMeeter): choose <strong>Sounds only</strong>, pick the mixer's virtual
            output under For others, and select its input in your app.
          </li>
          <li>
            Plain cable (VB-CABLE, Virtual Audio Cable): choose <strong>Mic and sounds</strong>, select the cable's
            playback side and your microphone, then select the cable's recording side in your app.
          </li>
        </ul>
        <h3>I have no virtual cable (mic only)</h3>
        <ol>
          <li>
            Download VB-CABLE from{" "}
            <button type="button" className="link" onClick={() => void openExternal(VB_CABLE_URL)}>
              vb-audio.com/Cable
            </button>
            . It is donationware: please consider supporting the author.
          </li>
          <li>Extract the archive, run the setup as administrator, and restart Windows.</li>
          <li>Choose <strong>Mic and sounds</strong>, select the cable and your microphone, then press Test cable.</li>
          <li>In your app, set the input to <strong>CABLE Output</strong>.</li>
        </ol>
      </details>
    </div>
  );
}
