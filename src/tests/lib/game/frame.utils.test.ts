import { describe, expect, it } from "vitest";

import {
  FRAME_FLAG_DIRTY,
  FRAME_FLAG_HALTED,
  FRAME_FLAG_HIRES,
  FRAME_FLAG_SOUND,
  FRAME_FLAG_WAIT_KEY,
  FRAME_HEADER_BYTES,
  HIGH_FRAME_BYTES,
  LOW_FRAME_BYTES,
  decodeGameFrame,
  expandFrame,
  parseHexColor,
} from "@/lib/game/frame.utils";

function response(flags: number, payload?: number[], size = LOW_FRAME_BYTES): ArrayBuffer {
  const bytes = new Uint8Array(FRAME_HEADER_BYTES + size);
  bytes[0] = flags;
  if (payload) bytes.set(payload, FRAME_HEADER_BYTES);
  return bytes.buffer;
}

describe("decodeGameFrame", () => {
  it("reads every header flag and slices the pixel payload", () => {
    const flags = FRAME_FLAG_DIRTY | FRAME_FLAG_SOUND | FRAME_FLAG_WAIT_KEY | FRAME_FLAG_HALTED;
    const frame = decodeGameFrame(response(flags, [0x80]));

    expect(frame).toMatchObject({
      cols: 64,
      rows: 32,
      dirty: true,
      hires: false,
      sound: true,
      waitingKey: true,
      halted: true,
    });
    expect(frame.pixels).toHaveLength(LOW_FRAME_BYTES);
    expect(frame.pixels[0]).toBe(0x80);
  });

  it("derives the high resolution from the payload size", () => {
    const frame = decodeGameFrame(response(FRAME_FLAG_HIRES, undefined, HIGH_FRAME_BYTES));

    expect(frame).toMatchObject({ cols: 128, rows: 64, hires: true, dirty: false });
    expect(frame.pixels).toHaveLength(HIGH_FRAME_BYTES);
  });

  it("rejects a payload that matches neither resolution", () => {
    expect(() => decodeGameFrame(response(0, undefined, 64))).toThrow(/unexpected game frame/u);
  });

  it("accepts a Uint8Array view of the response", () => {
    const frame = decodeGameFrame(new Uint8Array(response(0, undefined, HIGH_FRAME_BYTES)));

    expect(frame.hires).toBe(true);
  });
});

describe("expandFrame", () => {
  const ON = parseHexColor("#ff0000");
  const OFF = parseHexColor("#000000");

  it("expands rows-major MSB-first bits into rgba pixels", () => {
    const frame = decodeGameFrame(response(FRAME_FLAG_DIRTY, [0b10000001, 0x00, 0x01]));
    const target = new Uint8ClampedArray(frame.cols * frame.rows * 4);

    expandFrame(frame, target, ON, OFF);

    const pixel = (index: number): number[] => Array.from(target.slice(index * 4, index * 4 + 4));
    expect(pixel(0)).toEqual([...ON]);
    expect(pixel(1)).toEqual([...OFF]);
    expect(pixel(7)).toEqual([...ON]);
    expect(pixel(8)).toEqual([...OFF]);
    expect(pixel(23)).toEqual([...ON]);
  });

  it("walks rows of the high resolution layout", () => {
    const payload = Array.from({ length: HIGH_FRAME_BYTES }, () => 0);
    payload[16] = 0x80;
    const frame = decodeGameFrame(response(FRAME_FLAG_DIRTY, payload, HIGH_FRAME_BYTES));
    const target = new Uint8ClampedArray(frame.cols * frame.rows * 4);

    expandFrame(frame, target, ON, OFF);

    const pixel = (index: number): number[] => Array.from(target.slice(index * 4, index * 4 + 4));
    expect(pixel(128)).toEqual([...ON]);
    expect(pixel(129)).toEqual([...OFF]);
  });
});

describe("parseHexColor", () => {
  it("parses with and without the hash prefix", () => {
    expect(parseHexColor("#9be15d")).toEqual([0x9b, 0xe1, 0x5d, 0xff]);
    expect(parseHexColor("0d1608")).toEqual([0x0d, 0x16, 0x08, 0xff]);
  });

  it("rejects unsupported values", () => {
    expect(() => parseHexColor("red")).toThrow(/unsupported color/u);
  });
});
