type FadeDuration = "off" | "short" | "default" | "long";

const FADE_MS: Record<FadeDuration, number> = {
  off: 0,
  short: 100,
  default: 300,
  long: 600,
};

const EASE_IN_OUT_CUBIC = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

let sharedAudioCtx: AudioContext | null = null;
let gainNode: GainNode | null = null;
let sourceNode: MediaElementAudioSourceNode | null = null;
let currentMediaEl: HTMLMediaElement | null = null;
let fadeTimer: number | null = null;

function getAudioCtx(): AudioContext {
  if (!sharedAudioCtx || sharedAudioCtx.state === "closed") {
    sharedAudioCtx = new AudioContext();
  }
  return sharedAudioCtx;
}

export function connectVideoAudio(mediaEl: HTMLMediaElement) {
  if (currentMediaEl === mediaEl && sourceNode) return;

  if (sourceNode) {
    sourceNode.disconnect();
    sourceNode = null;
  }

  const ctx = getAudioCtx();
  gainNode = ctx.createGain();
  gainNode.gain.value = 1.0;
  gainNode.connect(ctx.destination);

  sourceNode = ctx.createMediaElementSource(mediaEl);
  sourceNode.connect(gainNode);
  currentMediaEl = mediaEl;
}

// Eased volume fade
function animateGain(
  from: number,
  to: number,
  durationMs: number,
): Promise<void> {
  return new Promise((resolve) => {
    if (fadeTimer !== null) cancelAnimationFrame(fadeTimer);
    if (!gainNode) {
      resolve();
      return;
    }

    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(elapsed / durationMs, 1);
      const eased = EASE_IN_OUT_CUBIC(t);
      const val = from + (to - from) * eased;
      gainNode!.gain.value = val;

      if (t < 1) {
        fadeTimer = requestAnimationFrame(tick);
      } else {
        fadeTimer = null;
        resolve();
      }
    };
    fadeTimer = requestAnimationFrame(tick);
  });
}

export async function fadeIn(duration: FadeDuration = "default") {
  const ms = FADE_MS[duration];
  if (ms <= 0 || !gainNode) return;
  const ctx = getAudioCtx();
  if (ctx.state === "suspended") await ctx.resume();
  gainNode.gain.value = 0;
  await animateGain(0, 1.0, ms);
}

export async function fadeOut(duration: FadeDuration = "default") {
  const ms = FADE_MS[duration];
  if (ms <= 0 || !gainNode) return;
  await animateGain(gainNode.gain.value, 0, ms);
}

export function resetAudioProcessing() {
  if (fadeTimer !== null) cancelAnimationFrame(fadeTimer);
  fadeTimer = null;
  if (sourceNode) {
    sourceNode.disconnect();
    sourceNode = null;
  }
  if (sharedAudioCtx) {
    sharedAudioCtx.close();
    sharedAudioCtx = null;
  }
  gainNode = null;
  currentMediaEl = null;
}

export type { FadeDuration };
