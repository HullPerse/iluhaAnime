import { describe, expect, it } from "vitest";

import {
  FRAME_FLAG_DIRTY,
  FRAME_FLAG_HALTED,
  FRAME_FLAG_HIRES,
  FRAME_FLAG_SOUND,
  FRAME_FLAG_WAIT_KEY,
  FRAME_FLAG_XO,
  FRAME_HEADER_BYTES,
  HIGH_FRAME_BYTES,
  HIGH_XO_FRAME_BYTES,
  LOW_FRAME_BYTES,
  LOW_XO_FRAME_BYTES,
  XO_AUDIO_BYTES,
  countLitPixels,
  decodeGameFrame,
  expandFrame,
  parseHexColor,
} from "@/lib/core/frame.utils";

function response(flags: number, payload?: number[], size = LOW_FRAME_BYTES): ArrayBuffer {
  const audio = (flags & FRAME_FLAG_XO) !== 0 ? XO_AUDIO_BYTES : 0;
  const bytes = new Uint8Array(FRAME_HEADER_BYTES + audio + size);
  bytes[0] = flags;
  if (payload) bytes.set(payload, FRAME_HEADER_BYTES + audio);
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
      xo: false,
      sound: true,
      waitingKey: true,
      halted: true,
      audio: null,
    });
    expect(frame.pixels).toHaveLength(LOW_FRAME_BYTES);
    expect(frame.pixels[0]).toBe(0x80);
  });

  it("derives the high resolution from the payload size", () => {
    const frame = decodeGameFrame(response(FRAME_FLAG_HIRES, undefined, HIGH_FRAME_BYTES));

    expect(frame).toMatchObject({ cols: 128, rows: 64, hires: true, dirty: false });
    expect(frame.pixels).toHaveLength(HIGH_FRAME_BYTES);
  });

  it("reads the audio block and two-bit payload of an XO frame", () => {
    const pattern = Array.from({ length: 16 }, (_, index) => index);
    const flags = FRAME_FLAG_XO | FRAME_FLAG_DIRTY | FRAME_FLAG_SOUND;
    const bytes = new Uint8Array(response(flags, [0b01_10_11_00], LOW_XO_FRAME_BYTES));
    bytes[FRAME_HEADER_BYTES] = 0xe0;
    bytes[FRAME_HEADER_BYTES + 1] = 0x0f;
    bytes.set(pattern, FRAME_HEADER_BYTES + 2);

    const frame = decodeGameFrame(bytes);

    expect(frame).toMatchObject({ cols: 64, rows: 32, xo: true, sound: true });
    expect(frame.audio?.pitchHz).toBe(0x0fe0);
    expect(Array.from(frame.audio?.pattern ?? [])).toEqual(pattern);
    expect(frame.pixels).toHaveLength(LOW_XO_FRAME_BYTES);
    expect(frame.pixels[0]).toBe(0b01_10_11_00);
  });

  it("derives the XO high resolution from the two-bit payload size", () => {
    const frame = decodeGameFrame(response(FRAME_FLAG_XO, undefined, HIGH_XO_FRAME_BYTES));

    expect(frame).toMatchObject({ cols: 128, rows: 64, hires: true, xo: true });
    expect(frame.pixels).toHaveLength(HIGH_XO_FRAME_BYTES);
  });

  it("rejects payloads that mix resolutions between layouts", () => {
    expect(() => decodeGameFrame(response(0, undefined, 64))).toThrow(/unexpected game frame/u);
    expect(() => decodeGameFrame(response(FRAME_FLAG_XO, undefined, LOW_FRAME_BYTES))).toThrow(
      /unexpected game frame/u
    );
    expect(() => decodeGameFrame(response(FRAME_FLAG_XO, undefined, HIGH_FRAME_BYTES))).toThrow(
      /unexpected game frame/u
    );
    expect(() => decodeGameFrame(response(0, undefined, LOW_XO_FRAME_BYTES))).toThrow(
      /unexpected game frame/u
    );
  });

  it("accepts a Uint8Array view of the response", () => {
    const frame = decodeGameFrame(new Uint8Array(response(0, undefined, HIGH_FRAME_BYTES)));

    expect(frame.hires).toBe(true);
  });
});

describe("expandFrame", () => {
  const ON = parseHexColor("#ff0000");
  const OFF = parseHexColor("#000000");
  const THEME = [OFF, ON] as const;

  it("expands rows-major MSB-first bits into rgba pixels", () => {
    const frame = decodeGameFrame(response(FRAME_FLAG_DIRTY, [0b10000001, 0x00, 0x01]));
    const target = new Uint8ClampedArray(frame.cols * frame.rows * 4);

    expandFrame(frame, target, THEME);

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

    expandFrame(frame, target, THEME);

    const pixel = (index: number): number[] => Array.from(target.slice(index * 4, index * 4 + 4));
    expect(pixel(128)).toEqual([...ON]);
    expect(pixel(129)).toEqual([...OFF]);
  });

  it("maps two-bit XO pixels to background, planes and the overlap", () => {
    const background = parseHexColor("#000000");
    const plane1 = parseHexColor("#ff0000");
    const plane2 = parseHexColor("#00ff00");
    const overlap = parseHexColor("#0000ff");
    const frame = decodeGameFrame(
      response(FRAME_FLAG_XO | FRAME_FLAG_DIRTY, [0b01_10_11_00], LOW_XO_FRAME_BYTES)
    );
    const target = new Uint8ClampedArray(frame.cols * frame.rows * 4);

    expandFrame(frame, target, [background, plane1, plane2, overlap]);

    const pixel = (index: number): number[] => Array.from(target.slice(index * 4, index * 4 + 4));
    expect(pixel(0)).toEqual([...plane1]);
    expect(pixel(1)).toEqual([...plane2]);
    expect(pixel(2)).toEqual([...overlap]);
    expect(pixel(3)).toEqual([...background]);
    expect(pixel(4)).toEqual([...background]);
  });

  it("refuses a palette that cannot cover the two-bit frame", () => {
    const frame = decodeGameFrame(response(FRAME_FLAG_XO, undefined, LOW_XO_FRAME_BYTES));
    const target = new Uint8ClampedArray(frame.cols * frame.rows * 4);

    expect(() => expandFrame(frame, target, THEME)).toThrow(/needs 4 colors/u);
  });
});

describe("countLitPixels", () => {
  it("counts set pixels for one-bit and XO frames alike", () => {
    expect(countLitPixels(decodeGameFrame(response(0, [0b10000001, 0b00000011])))).toBe(4);
    expect(
      countLitPixels(decodeGameFrame(response(FRAME_FLAG_XO, [0b01_10_11_00], LOW_XO_FRAME_BYTES)))
    ).toBe(3);
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
