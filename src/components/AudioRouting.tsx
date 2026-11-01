import { useEffect, useState } from "react";
import { api } from "../api";
import type { AudioMode, CablePair, OutputDevice, RoutingState } from "../types";
import { Select } from "./Select";

type Props = {
  routing: RoutingState;
  outputs: OutputDevice[];
  onRoutingChanged: (next: RoutingState) => void;
  onOpenGuide: () => void | Promise<void>;
  onError: (message: string) => void;
};

/** Settings → Audio routing: Mode A (sounds only) or Mode B (sounds into a virtual cable). */
export function AudioRouting({ routing, outputs, onRoutingChanged, onOpenGuide, onError }: Props) {
  const [inputs, setInputs] = useState<OutputDevice[]>([]);
  const [cable, setCable] = useState<CablePair | null>(null);
  const [playback, setPlayback] = useState(routing.cablePlayback ?? "");
  const [record, setRecord] = useState(routing.cableRecord ?? "");
  const mix = routing.mode === "mix";

  // Cable status is only needed in Mode B. Poll while it is shown, like the guide does.
  useEffect(() => {
    if (!mix) return;
    let alive = true;
    const check = async () => {
      try {
        const found = await api.detectCable();
        if (alive) setCable(found);
      } catch (e) {
        if (alive) onError(String(e));
      }
    };
    void check();
    const timer = setInterval(check, 2000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [mix, onError]);

  useEffect(() => {
    void api.listInputDevices().then(setInputs).catch((e) => onError(String(e)));
  }, [onError]);

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

  const savedRecordName = inputs.find((d) => d.id === routing.cableRecord)?.name ?? cable?.recordName ?? null;

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
            Sounds play to the output chosen under For others. Use this when your mixer (Wave Link, VoiceMeeter)
            already adds your microphone.
          </p>
          <p className="hint">In Discord, pick the input your mixer provides.</p>
          <div className="step-actions">
            <button type="button" className="btn" onClick={onOpenGuide}>
              Setup guide
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="hint">
            Sounds go into the virtual cable. Microphone mixing is not in this version yet, so Discord hears the
            sounds only.
          </p>

          <ol className="steps">
            <li>
              <p className="step-title">Virtual cable</p>
              <p className={`status ${cable ? "ok" : "alarm"}`} role="status">
                {cable ? `Detected: ${cable.playbackName} / ${cable.recordName}` : "Not connected. Install a virtual cable first."}
              </p>
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
              <p className="step-title">Discord input</p>
              <p className="hint">
                Discord → Voice &amp; Video → Input Device → <strong>{savedRecordName ?? "the recording side of your cable"}</strong>
              </p>
              <p className="hint">Do not pick the playback side in Discord, and do not set the cable as the Windows default device.</p>
            </li>
          </ol>
        </>
      )}
    </>
  );
}
