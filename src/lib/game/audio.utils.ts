import { attemptSync } from "@/lib/utils/attempt.utils";

const BEEP_HZ = 440;
const BEEP_GAIN = 0.05;
const GAIN_RAMP_SECONDS = 0.005;

/** XO-CHIP pattern buffer: sixteen bytes of one-bit samples. */
const PATTERN_BITS = 128;
/** The pitch register default, matching the interpreter's 4000 Hz. */
const DEFAULT_PITCH_HZ = 4000;

export type GameAudioMode = "beep" | "wavetable";

export interface GameAudio {
  /** Follows the VM sound flag; a no-op when the state does not change. */
  setActive: (active: boolean) => void;
  /** XO-CHIP buzzer state; ignored by beep sessions. */
  setWavetable: (pitchHz: number, pattern: Uint8Array) => void;
  dispose: () => void;
}

interface WavetableBuzzer {
  set: (pitchHz: number, pattern: Uint8Array) => void;
  /** The buzzer reached zero: playback restarts from the first sample. */
  reset: () => void;
  dispose: () => void;
}

/**
 * Holds the pattern buffer as a looping source: one buffer sample per pattern
 * bit, so `playbackRate = pitch / sampleRate` plays the bits at the requested
 * hertz. The phase keeps running across pattern and pitch changes and only
 * resets when the buzzer turns off, as the XO-CHIP specification asks.
 */
function createWavetableBuzzer(context: AudioContext, gain: GainNode): WavetableBuzzer {
  let source: AudioBufferSourceNode | null = null;
  let buffer: AudioBuffer | null = null;
  let sample: Uint8Array | null = null;
  let pitch = DEFAULT_PITCH_HZ;
  let phase = 0;
  let stamp = context.currentTime;

  const restart = (): void => {
    const previous = source;
    source = null;
    if (previous) {
      attemptSync(() => {
        previous.stop();
        previous.disconnect();
      });
    }
    if (!buffer) return;
    const next = context.createBufferSource();
    next.buffer = buffer;
    next.loop = true;
    next.playbackRate.value = pitch / context.sampleRate;
    next.connect(gain);
    attemptSync(() => next.start(0, phase / context.sampleRate));
    source = next;
  };

  const sync = (): void => {
    const now = context.currentTime;
    phase = (phase + (now - stamp) * pitch) % PATTERN_BITS;
    stamp = now;
  };

  return {
    set(pitchHz, pattern) {
      const samePattern =
        sample !== null &&
        sample.length === pattern.length &&
        sample.every((byte, index) => byte === pattern[index]);
      if (samePattern && pitchHz === pitch) return;
      sync();
      pitch = pitchHz;
      if (samePattern) {
        if (source) source.playbackRate.value = pitch / context.sampleRate;
        return;
      }
      sample = pattern.slice();
      buffer = context.createBuffer(1, PATTERN_BITS, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let bit = 0; bit < PATTERN_BITS; bit += 1) {
        const on = (pattern[bit >> 3] & (0x80 >> (bit & 7))) !== 0;
        data[bit] = on ? 1 : -1;
      }
      restart();
    },
    reset() {
      phase = 0;
      stamp = context.currentTime;
      restart();
    },
    dispose() {
      const previous = source;
      source = null;
      buffer = null;
      sample = null;
      if (previous) {
        attemptSync(() => {
          previous.stop();
          previous.disconnect();
        });
      }
    },
  };
}

/**
 * Buzzer gate for a game session. Beep mode keeps the square oscillator of
 * plain CHIP-8 sessions; wavetable mode renders the XO-CHIP pattern buffer.
 * Nodes are created on the first active flag, so beeps never allocate mid-run.
 */
export function createGameAudio(mode: GameAudioMode = "beep"): GameAudio {
  let nodes: {
    context: AudioContext;
    gain: GainNode;
    buzzer: WavetableBuzzer | null;
    disposeSource: () => void;
  } | null = null;
  let active = false;
  let pending: { pitchHz: number; pattern: Uint8Array } | null = null;

  const apply = (): void => {
    if (!nodes) return;
    nodes.gain.gain.setTargetAtTime(
      active ? BEEP_GAIN : 0,
      nodes.context.currentTime,
      GAIN_RAMP_SECONDS
    );
  };

  const createNodes = (): typeof nodes => {
    if (nodes) return nodes;
    const [context, error] = attemptSync(() => new AudioContext());
    if (error !== null || !context) return null;
    const gain = context.createGain();
    gain.gain.value = 0;
    gain.connect(context.destination);
    if (mode === "wavetable") {
      const buzzer = createWavetableBuzzer(context, gain);
      if (pending) buzzer.set(pending.pitchHz, pending.pattern);
      nodes = { context, gain, buzzer, disposeSource: () => buzzer.dispose() };
      return nodes;
    }
    const oscillator = context.createOscillator();
    oscillator.type = "square";
    oscillator.frequency.value = BEEP_HZ;
    oscillator.connect(gain);
    oscillator.start();
    nodes = {
      context,
      gain,
      buzzer: null,
      disposeSource: () => {
        oscillator.stop();
        oscillator.disconnect();
      },
    };
    return nodes;
  };

  return {
    setActive(next) {
      if (next === active) return;
      active = next;
      if (next) {
        const created = createNodes();
        if (!created) {
          active = false;
          return;
        }
        if (created.context.state === "suspended") {
          attemptSync(() => {
            created.context.resume().catch(() => undefined);
          });
        }
      } else {
        nodes?.buzzer?.reset();
      }
      apply();
    },
    setWavetable(pitchHz, pattern) {
      if (mode !== "wavetable") return;
      pending = { pitchHz, pattern };
      nodes?.buzzer?.set(pitchHz, pattern);
    },
    dispose() {
      active = false;
      const current = nodes;
      nodes = null;
      if (!current) return;
      attemptSync(() => {
        current.disposeSource();
      });
      attemptSync(() => {
        current.gain.disconnect();
      });
      attemptSync(() => {
        current.context.close().catch(() => undefined);
      });
    },
  };
}
