/**
 * Tiny procedural sound engine (Web Audio API). No audio files — every cue is
 * synthesised from oscillators, keeping the game self-contained and giving it a
 * chiptune/8-bit character that matches the pixel art. Works in the browser and
 * inside the Capacitor WebView on Android/iOS.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function ensure(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.45;
    master.connect(ctx.destination);
  }
  return ctx;
}

/**
 * Resume the audio context. Browsers (iOS especially) start it "suspended"
 * until a user gesture, so call this from the first tap/keypress.
 */
export function unlockAudio(): void {
  const c = ensure();
  if (!c) return;
  if (c.state === "suspended") void c.resume();
  // iOS/WKWebView needs a real (silent) buffer *started inside the gesture* to
  // fully unlock Web Audio — resume() alone isn't enough there.
  try {
    const src = c.createBufferSource();
    src.buffer = c.createBuffer(1, 1, 22050);
    src.connect(c.destination);
    src.start(0);
  } catch {
    /* ignore */
  }
}

export function isMuted(): boolean {
  try {
    return localStorage.getItem("block-shift.muted") === "1";
  } catch {
    return false;
  }
}

export function setMuted(muted: boolean): void {
  try {
    localStorage.setItem("block-shift.muted", muted ? "1" : "0");
  } catch {
    /* ignore private-mode storage errors */
  }
}

/** Play a single enveloped oscillator note. Offsets are seconds from "now". */
function tone(
  freq: number,
  startOffset: number,
  duration: number,
  type: OscillatorType,
  gain: number,
): void {
  const c = ensure();
  if (!c || !master) return;
  const t0 = c.currentTime + startOffset;
  const osc = c.createOscillator();
  const env = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  osc.connect(env);
  env.connect(master);
  // Short attack, exponential decay — the classic plucky chiptune envelope.
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.start(t0);
  osc.stop(t0 + duration + 0.03);
}

/** A tone whose pitch glides from f0 → f1 (for plops / drops). */
function toneGlide(
  f0: number,
  f1: number,
  startOffset: number,
  duration: number,
  type: OscillatorType,
  gain: number,
): void {
  const c = ensure();
  if (!c || !master) return;
  const t0 = c.currentTime + startOffset;
  const osc = c.createOscillator();
  const env = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + duration);
  osc.connect(env);
  env.connect(master);
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.start(t0);
  osc.stop(t0 + duration + 0.03);
}

function live(): AudioContext | null {
  if (isMuted()) return null;
  const c = ensure();
  if (!c) return null;
  if (c.state === "suspended") void c.resume();
  return c;
}

/** Bright, tiny "pick up" click when a block is selected/lifted. */
export function playPick(): void {
  if (!live()) return;
  tone(660.0, 0.0, 0.05, "square", 0.09); // E5
  tone(880.0, 0.028, 0.06, "square", 0.08); // A5
}

/** A short "plop" when a run of blocks lands in a tube. */
export function playPour(): void {
  if (!live()) return;
  toneGlide(520, 200, 0, 0.13, "triangle", 0.12); // downward plop
  tone(170.0, 0.0, 0.09, "square", 0.05); // low body
}

/** Rewarding ascending chime when a tube is completed. */
export function playComplete(): void {
  if (!live()) return;
  tone(783.99, 0.0, 0.09, "square", 0.11); // G5
  tone(1046.5, 0.075, 0.09, "square", 0.11); // C6
  tone(1318.51, 0.15, 0.18, "triangle", 0.1); // E6
}

/** Short confirmation blip (used when the player switches sound back on). */
export function playBlip(): void {
  if (isMuted()) return;
  const c = ensure();
  if (!c) return;
  if (c.state === "suspended") void c.resume();
  tone(880.0, 0.0, 0.09, "square", 0.12); // A5
  tone(1174.66, 0.05, 0.1, "square", 0.1); // D6
}

/** Triumphant victory fanfare: a C-major arpeggio rising to a held high C. */
export function playWin(): void {
  if (isMuted()) return;
  const c = ensure();
  if (!c) return;
  if (c.state === "suspended") void c.resume();

  // Square-wave lead arpeggio C5 → E5 → G5 → C6.
  const lead: [number, number, number][] = [
    [523.25, 0.0, 0.14], // C5
    [659.25, 0.1, 0.14], // E5
    [783.99, 0.2, 0.14], // G5
    [1046.5, 0.3, 0.38], // C6 (held)
  ];
  for (const [f, s, d] of lead) tone(f, s, d, "square", 0.16);

  // Warmth + sparkle over the held note.
  tone(783.99, 0.3, 0.38, "triangle", 0.1); // G5 pad
  tone(1318.51, 0.34, 0.32, "square", 0.07); // E6 sparkle
  tone(2093.0, 0.42, 0.24, "triangle", 0.05); // C7 shimmer
}
