import { afterEach, describe, expect, it, vi } from "vitest";

import { createGameAudio } from "@/lib/game/audio.utils";

type FakeParam = {
  value: number;
  setTargetAtTime: ReturnType<typeof vi.fn>;
};

type FakeGain = {
  gain: FakeParam;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
};

type FakeOscillator = {
  type: string;
  frequency: FakeParam;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
};

const contexts: FakeAudioContext[] = [];

class FakeAudioContext {
  state = "suspended";
  currentTime = 0;
  destination = {};
  oscillators: FakeOscillator[] = [];
  gains: FakeGain[] = [];
  resume = vi.fn(async () => undefined);
  close = vi.fn(async () => undefined);

  constructor() {
    contexts.push(this);
  }

  createGain(): FakeGain {
    const gain = {
      gain: { value: 0, setTargetAtTime: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    this.gains.push(gain);
    return gain;
  }

  createOscillator(): FakeOscillator {
    const oscillator = {
      type: "",
      frequency: { value: 0, setTargetAtTime: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    this.oscillators.push(oscillator);
    return oscillator;
  }
}

describe("createGameAudio", () => {
  afterEach(() => {
    contexts.length = 0;
    vi.unstubAllGlobals();
  });

  it("survives a missing AudioContext", () => {
    vi.stubGlobal("AudioContext", undefined);
    const audio = createGameAudio();

    expect(() => audio.setActive(true)).not.toThrow();
    expect(() => audio.dispose()).not.toThrow();
  });

  it("creates no nodes before the first active sound flag", () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const audio = createGameAudio();

    audio.setActive(false);
    expect(contexts).toHaveLength(0);

    audio.dispose();
  });

  it("keeps one oscillator for the session and gates it through the gain", () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const audio = createGameAudio();

    audio.setActive(true);
    const context = contexts.at(-1);
    expect(context).toBeDefined();
    expect(context?.oscillators).toHaveLength(1);
    expect(context?.oscillators[0].start).toHaveBeenCalledTimes(1);
    expect(context?.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(
      0.05,
      0,
      expect.any(Number)
    );

    audio.setActive(true);
    expect(context?.oscillators).toHaveLength(1);

    audio.setActive(false);
    expect(context?.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(
      0,
      0,
      expect.any(Number)
    );

    audio.dispose();
    expect(context?.oscillators[0].stop).toHaveBeenCalledTimes(1);
    expect(context?.close).toHaveBeenCalledTimes(1);
  });
});
