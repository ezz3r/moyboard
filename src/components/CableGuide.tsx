import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { CablePair } from "../types";

const DOWNLOAD_URL = "https://vb-audio.com/Cable/";
const DONATE_URL = "https://vb-audio.com/";
const POLL_MS = 2000;

type Props = {
  /** A cable was found and saved. Continues to Settings. */
  onFinish: () => void;
  /** Closes the guide for now. It opens again on the next start while no cable is set up. */
  onLater: () => void;
  /** The user uses another setup (an existing mixer). Clears the guide and opens Settings. */
  onSomethingElse: () => void;
  onError: (message: string) => void;
};

/**
 * Guided install of a virtual cable (VB-CABLE). moyboard does not install the driver. It links to
 * the official page, then polls the audio devices until both cable sides appear.
 * Step texts follow the VB-Audio page; check them before each release.
 */
export function CableGuide({ onFinish, onLater, onSomethingElse, onError }: Props) {
  const [cable, setCable] = useState<CablePair | null>(null);
  const [checking, setChecking] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const found = await api.detectCable();
      if (found) {
        await api.setCable(found.playbackId, found.recordId);
        await api.setSetupState("completed");
        setCable(found);
      }
      setFailed(null);
    } catch (e) {
      setFailed(String(e));
    } finally {
      setChecking(false);
    }
  }, []);

  // Poll until a cable is found. The effect stops once `cable` is set.
  useEffect(() => {
    if (cable) return;
    void check();
    const timer = setInterval(() => void check(), POLL_MS);
    return () => clearInterval(timer);
  }, [cable, check]);

  const open = (url: string) => {
    api.openUrl(url).catch((e) => onError(String(e)));
  };

  if (cable) {
    return (
      <section className="settings guide" aria-labelledby="guide-title">
        <h2 id="guide-title">Virtual cable found</h2>
        <p className="status ok" role="status">
          Detected: {cable.playbackName} / {cable.recordName} ✓
        </p>
        <p className="hint">The cable is saved. Next, check the microphone in Settings → Audio routing.</p>
        <div className="step-actions">
          <button type="button" className="btn btn-primary" onClick={onFinish}>
            Continue
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="settings guide" aria-labelledby="guide-title">
      <h2 id="guide-title">Install a virtual cable</h2>
      <p className="hint">
        moyboard needs a virtual audio cable to reach your app and games through your microphone. Follow these steps.
      </p>

      <ol className="steps">
        <li>
          <p className="step-title">Open the VB-Audio download page</p>
          <div className="step-actions">
            <button type="button" className="btn" onClick={() => open(DOWNLOAD_URL)}>
              Open download page
            </button>
          </div>
        </li>
        <li>
          <p className="step-title">Download the ZIP and extract it</p>
        </li>
        <li>
          <p className="step-title">Run the installer as administrator</p>
          <p className="hint">
            Right-click <code>VBCABLE_Setup_x64.exe</code> → Run as administrator → Install Driver. Windows asks for
            permission. moyboard does not need it.
          </p>
        </li>
        <li>
          <p className="step-title">Restart Windows if asked</p>
          <p className="hint">Restart if the installer asks for it, or if the cable does not appear.</p>
        </li>
        <li>
          <p className="step-title">Come back to moyboard</p>
          <p className="hint">moyboard detects the cable on its own.</p>
        </li>
      </ol>

      <p className={`status${failed ? " alarm" : ""}`} role="status" aria-live="polite">
        {failed
          ? `Could not read the audio devices: ${failed}`
          : checking
            ? "Checking for the virtual cable…"
            : "Waiting for the virtual cable…"}
      </p>

      <div className="step-actions">
        <button type="button" className="btn" onClick={() => void check()} disabled={checking}>
          Check again
        </button>
        <button type="button" className="btn" onClick={onLater}>
          Remind me later
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            api.setSetupState(null).catch((e) => onError(String(e)));
            onSomethingElse();
          }}
        >
          I use something else
        </button>
      </div>

      <p className="hint">
        VB-CABLE is donationware by VB-Audio. Please consider supporting the developer.{" "}
        <button type="button" className="link-button" onClick={() => open(DONATE_URL)}>
          vb-audio.com
        </button>
      </p>
    </section>
  );
}
