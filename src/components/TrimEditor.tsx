import { useEffect, useId, useRef, useState } from "react";
import { api } from "../api";
import { stemOf } from "../names";
import type { SoundEntry, Waveform } from "../types";

const MIN_LEN = 0.05; // seconds; start and end never cross
const EPS = 0.005;

type Props = {
  entry: SoundEntry;
  onClose: () => void;
  onSaved: () => void;
  onExported: (newName: string) => void;
};

export function TrimEditor({ entry, onClose, onSaved, onExported }: Props) {
  const name = stemOf(entry.fileName);
  const [wave, setWave] = useState<Waveform | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [start, setStart] = useState(entry.meta.trimStart ?? 0);
  const [end, setEnd] = useState<number | null>(entry.meta.trimEnd);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();

  const duration = wave?.durationSecs ?? 0;
  const endPos = end ?? duration;

  useEffect(() => {
    let alive = true;
    api
      .waveform(entry.fileName)
      .then((w) => {
        if (!alive) return;
        setWave(w);
        setEnd((e) => e ?? w.durationSecs);
      })
      .catch((e) => alive && setLoadError(String(e)));
    return () => {
      alive = false;
    };
  }, [entry.fileName]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const full = duration > 0 && start <= EPS && endPos >= duration - EPS;
  const trimStart = full ? null : start;
  const trimEnd = full ? null : endPos;

  function setStartClamped(v: number) {
    setStart(Math.min(Math.max(0, v), endPos - MIN_LEN));
  }
  function setEndClamped(v: number) {
    setEnd(Math.max(Math.min(duration, v), start + MIN_LEN));
  }

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      await fn();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
      if (label) setStatus(label);
    }
  }

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet sheet-wide" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId}>Trim {name}</h2>

        {loadError && <p className="error" role="alert">{loadError}</p>}
        {!wave && !loadError && <p className="hint">Reading waveform…</p>}

        {wave && (
          <WaveEditor
            wave={wave}
            start={start}
            end={endPos}
            onStart={setStartClamped}
            onEnd={setEndClamped}
          />
        )}

        {wave && (
          <div className="trim-fields">
            <label className="field">
              <span>Start, s</span>
              <input
                type="number"
                min={0}
                max={duration}
                step={0.01}
                value={start.toFixed(2)}
                onChange={(e) => setStartClamped(Number(e.target.value))}
              />
            </label>
            <label className="field">
              <span>End, s</span>
              <input
                type="number"
                min={0}
                max={duration}
                step={0.01}
                value={endPos.toFixed(2)}
                onChange={(e) => setEndClamped(Number(e.target.value))}
              />
            </label>
            <div className="field">
              <span>Length</span>
              <output className="value">{(endPos - start).toFixed(2)} s</output>
            </div>
          </div>
        )}

        {status && <p className="hint" role="status">{status}</p>}
        {error && <p className="error" role="alert">{error}</p>}

        <div className="sheet-actions sheet-split">
          <div className="sheet-actions">
            <button
              type="button"
              className="btn"
              disabled={busy || !wave}
              onClick={() => run("", () => api.previewSound(entry.fileName, trimStart, trimEnd))}
            >
              Play region
            </button>
            <button
              type="button"
              className="btn btn-quiet"
              disabled={busy}
              onClick={() => run("", () => api.stopAll())}
            >
              Stop
            </button>
          </div>
          <div className="sheet-actions">
            <button
              type="button"
              className="btn btn-quiet"
              disabled={busy || !wave}
              onClick={() => {
                setStart(0);
                setEnd(duration);
              }}
            >
              Reset
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy || !wave || full}
              onClick={() =>
                run("Saved as a new file.", async () => {
                  const newName = await api.exportTrim(entry.fileName, trimStart, trimEnd);
                  onExported(newName);
                })
              }
            >
              Save as new file
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !wave}
              onClick={() =>
                run("", async () => {
                  await api.setSoundMeta(entry.fileName, {
                    ...entry.meta,
                    trimStart,
                    trimEnd,
                  });
                  onSaved();
                })
              }
            >
              Save trim
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function WaveEditor({
  wave,
  start,
  end,
  onStart,
  onEnd,
}: {
  wave: Waveform;
  start: number;
  end: number;
  onStart: (t: number) => void;
  onEnd: (t: number) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const dragging = useRef<"start" | "end" | null>(null);
  const dur = wave.durationSecs;
  const HEIGHT = 140;

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = canvas.current;
    if (!c || width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = width * dpr;
    c.height = HEIGHT * dpr;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, HEIGHT);

    const css = getComputedStyle(document.documentElement);
    const ink = css.getPropertyValue("--ink").trim();
    const ink2 = css.getPropertyValue("--ink-2").trim();
    const signal = css.getPropertyValue("--signal").trim();

    const mid = HEIGHT / 2;
    const perSec = wave.peaksPerSec;
    for (let x = 0; x < width; x++) {
      const i0 = Math.floor(((x / width) * dur) * perSec);
      const i1 = Math.max(i0 + 1, Math.floor((((x + 1) / width) * dur) * perSec));
      let peak = 0;
      for (let i = i0; i < i1 && i < wave.peaks.length; i++) peak = Math.max(peak, wave.peaks[i]);
      const t = (x / width) * dur;
      const inside = t >= start && t < end;
      ctx.fillStyle = inside ? ink : ink2;
      ctx.globalAlpha = inside ? 1 : 0.3;
      const h = Math.max(1, peak * (HEIGHT - 16));
      ctx.fillRect(x, mid - h / 2, 1, h);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = signal;
    const xs = Math.round((start / dur) * width);
    const xe = Math.round((end / dur) * width);
    ctx.fillRect(xs, 0, 2, HEIGHT);
    ctx.fillRect(xe - 2, 0, 2, HEIGHT);
  }, [wave, start, end, width, dur]);

  const timeAt = (clientX: number) => {
    const rect = wrap.current!.getBoundingClientRect();
    return Math.min(dur, Math.max(0, ((clientX - rect.left) / rect.width) * dur));
  };

  return (
    <div
      ref={wrap}
      className="wave"
      onPointerDown={(e) => {
        const t = timeAt(e.clientX);
        dragging.current = Math.abs(t - start) <= Math.abs(t - end) ? "start" : "end";
        e.currentTarget.setPointerCapture(e.pointerId);
        (dragging.current === "start" ? onStart : onEnd)(t);
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return;
        const t = timeAt(e.clientX);
        (dragging.current === "start" ? onStart : onEnd)(t);
      }}
      onPointerUp={() => (dragging.current = null)}
      onPointerCancel={() => (dragging.current = null)}
    >
      <canvas ref={canvas} style={{ width, height: HEIGHT }} aria-hidden="true" />
      {dur > 0 && (
        <>
          <Handle label="Start" value={start} dur={dur} onChange={onStart} />
          <Handle label="End" value={end} dur={dur} onChange={onEnd} />
        </>
      )}
    </div>
  );
}

function Handle({
  label,
  value,
  dur,
  onChange,
}: {
  label: string;
  value: number;
  dur: number;
  onChange: (t: number) => void;
}) {
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Number(dur.toFixed(2))}
      aria-valuenow={Number(value.toFixed(2))}
      aria-valuetext={`${value.toFixed(2)} seconds`}
      className="handle"
      style={{ left: `${(value / dur) * 100}%` }}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 0.1 : 0.01;
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") onChange(value - step);
        else if (e.key === "ArrowRight" || e.key === "ArrowUp") onChange(value + step);
        else return;
        e.preventDefault();
      }}
    />
  );
}
