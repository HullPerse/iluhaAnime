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

type FakeBuffer = {
  length: number;
  data: Float32Array;
  getChannelData: () => Float32Array;
};

type FakeBufferSource = {
  buffer: FakeBuffer | null;
  loop: boolean;
  playbackRate: FakeParam;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
};

const contexts: FakeAudioContext[] = [];

class FakeAudioContext {
  state = "suspended";
  currentTime = 0;
  sampleRate = 48000;
  destination = {};
  oscillators: FakeOscillator[] = [];
  gains: FakeGain[] = [];
  buffers: FakeBuffer[] = [];
  sources: FakeBufferSource[] = [];
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

  createBuffer(_channels: number, length: number, _sampleRate: number): FakeBuffer {
    const data = new Float32Array(length);
    const buffer = { length, data, getChannelData: () => data };
    this.buffers.push(buffer);
    return buffer;
  }

  createBufferSource(): FakeBufferSource {
    const source = {
      buffer: null,
      loop: false,
      playbackRate: { value: 0, setTargetAtTime: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    this.sources.push(source);
    return source;
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
    expect(() => audio.setWavetable(4000, new Uint8Array(16))).not.toThrow();
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

  it("scales the gain with the volume and re-applies it live", () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const audio = createGameAudio();

    audio.setVolume(0.5);
    audio.setActive(true);
    const gain = contexts.at(-1)?.gains[0].gain;
    expect(gain?.setTargetAtTime).toHaveBeenLastCalledWith(
      expect.closeTo(0.025),
      0,
      expect.any(Number)
    );

    audio.setVolume(0.2);
    expect(gain?.setTargetAtTime).toHaveBeenLastCalledWith(
      expect.closeTo(0.01),
      0,
      expect.any(Number)
    );

    audio.setVolume(4);
    expect(gain?.setTargetAtTime).toHaveBeenLastCalledWith(
      expect.closeTo(0.05),
      0,
      expect.any(Number)
    );

    audio.setVolume(-1);
    expect(gain?.setTargetAtTime).toHaveBeenLastCalledWith(0, 0, expect.any(Number));

    audio.dispose();
  });

  it("uses the volume chosen before the first sound flag", () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const audio = createGameAudio();

    audio.setVolume(0.5);
    audio.setActive(false);
    expect(contexts).toHaveLength(0);

    audio.setActive(true);
    expect(contexts.at(-1)?.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(
      expect.closeTo(0.025),
      0,
      expect.any(Number)
    );
    audio.dispose();
  });
});

describe("createGameAudio wavetable mode", () => {
  afterEach(() => {
    contexts.length = 0;
    vi.unstubAllGlobals();
  });

  it("ignores wavetable calls from beep sessions", () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const audio = createGameAudio();

    audio.setWavetable(4000, new Uint8Array(16));
    audio.setActive(true);

    expect(contexts.at(-1)?.buffers).toHaveLength(0);
    expect(contexts.at(-1)?.sources).toHaveLength(0);
    audio.dispose();
  });

  it("plays the pattern as a looping buffer at the pitch rate", () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const audio = createGameAudio("wavetable");
    const pattern = new Uint8Array(16);
    pattern[0] = 0b1100_0000;

    audio.setWavetable(4000, pattern);
    expect(contexts).toHaveLength(0);
    audio.setActive(true);

    const context = contexts.at(-1);
    expect(context).toBeDefined();
    const buffer = context?.buffers[0];
    expect(buffer?.length).toBe(128);
    expect(buffer?.data[0]).toBe(1);
    expect(buffer?.data[1]).toBe(1);
    expect(buffer?.data[2]).toBe(-1);
    expect(buffer?.data[127]).toBe(-1);
    const source = context?.sources[0];
    expect(source?.loop).toBe(true);
    expect(source?.buffer).toBe(buffer);
    expect(source?.playbackRate.value).toBeCloseTo(4000 / 48000);
    expect(source?.start).toHaveBeenCalledWith(0, 0);
    expect(context?.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(
      0.05,
      0,
      expect.any(Number)
    );

    audio.dispose();
    expect(source?.stop).toHaveBeenCalledTimes(1);
    expect(context?.close).toHaveBeenCalledTimes(1);
  });

  it("keeps the phase across pattern changes and restarts at the tracked bit", () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const audio = createGameAudio("wavetable");

    audio.setWavetable(4000, new Uint8Array(16));
    audio.setActive(true);
    const context = contexts.at(-1);
    expect(context).toBeDefined();

    // 0.25 s at the 4000 Hz default advances 1000 bits: 1000 % 128.
    if (context) context.currentTime = 0.25;
    audio.setWavetable(4000, new Uint8Array(16).fill(0xff));

    expect(context?.sources).toHaveLength(2);
    expect(context?.sources[1].start).toHaveBeenCalledWith(0, 104 / 48000);
    audio.dispose();
  });

  it("updates the playback rate without rebuilding the buffer on pitch changes", () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const audio = createGameAudio("wavetable");
    const pattern = new Uint8Array(16);

    audio.setWavetable(4000, pattern);
    audio.setActive(true);
    const context = contexts.at(-1);
    if (context) context.currentTime = 0.25;
    audio.setWavetable(8000, pattern);

    expect(context?.sources).toHaveLength(1);
    expect(context?.sources[0].playbackRate.value).toBeCloseTo(8000 / 48000);
    audio.dispose();
  });

  it("resets the phase when the buzzer stops", () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const audio = createGameAudio("wavetable");

    audio.setWavetable(4000, new Uint8Array(16));
    audio.setActive(true);
    const context = contexts.at(-1);
    if (context) context.currentTime = 0.1;
    audio.setActive(false);

    expect(context?.sources).toHaveLength(2);
    expect(context?.sources[1].start).toHaveBeenCalledWith(0, 0);
    expect(context?.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(
      0,
      0.1,
      expect.any(Number)
    );
    audio.dispose();
  });
});
