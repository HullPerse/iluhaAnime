import { attemptSync } from "@/lib/utils/attempt.utils";

const BEEP_HZ = 440;
const BEEP_GAIN = 0.05;
const GAIN_RAMP_SECONDS = 0.005;

export interface GameAudio {
  /** Follows the VM sound flag; a no-op when the state does not change. */
  setActive: (active: boolean) => void;
  dispose: () => void;
}

function createNodes(): {
  context: AudioContext;
  gain: GainNode;
  oscillator: OscillatorNode;
} | null {
  const [created, error] = attemptSync(() => new AudioContext());
  if (error !== null || !created) return null;
  const gain = created.createGain();
  gain.gain.value = 0;
  gain.connect(created.destination);
  const oscillator = created.createOscillator();
  oscillator.type = "square";
  oscillator.frequency.value = BEEP_HZ;
  oscillator.connect(gain);
  oscillator.start();
  return { context: created, gain, oscillator };
}

/**
 * Square-wave beep for the CHIP-8 sound timer. The oscillator runs for the
 * whole session and the gain gate follows the VM flag, so beeps never allocate
 * nodes mid-frame.
 */
export function createGameAudio(): GameAudio {
  let nodes: ReturnType<typeof createNodes> = null;
  let active = false;

  const apply = (): void => {
    if (!nodes) return;
    nodes.gain.gain.setTargetAtTime(active ? BEEP_GAIN : 0, nodes.context.currentTime, GAIN_RAMP_SECONDS);
  };

  return {
    setActive(next) {
      if (next === active) return;
      active = next;
      if (next && !nodes) {
        nodes = createNodes();
        if (!nodes) {
          active = false;
          return;
        }
      }
      const current = nodes;
      if (next && current && current.context.state === "suspended") {
        attemptSync(() => {
          current.context.resume().catch(() => undefined);
        });
      }
      apply();
    },
    dispose() {
      active = false;
      const current = nodes;
      nodes = null;
      if (!current) return;
      attemptSync(() => {
        current.oscillator.stop();
        current.oscillator.disconnect();
        current.gain.disconnect();
      });
      attemptSync(() => {
        current.context.close().catch(() => undefined);
      });
    },
  };
}
