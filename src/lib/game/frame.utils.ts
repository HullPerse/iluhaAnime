import { attemptSync } from "@/lib/utils/attempt.utils";
import type { GameFrame } from "@/types/game";

/** `game_tick` response layout: 4 header bytes, then the packed framebuffer. */
export const FRAME_HEADER_BYTES = 4;
export const FRAME_FLAG_DIRTY = 0x01;
export const FRAME_FLAG_HIRES = 0x02;
export const FRAME_FLAG_SOUND = 0x04;
export const FRAME_FLAG_WAIT_KEY = 0x08;
export const FRAME_FLAG_HALTED = 0x10;

export const LOW_FRAME_BYTES = (64 * 32) / 8;
export const HIGH_FRAME_BYTES = (128 * 64) / 8;

export type Rgba = readonly [number, number, number, number];

export function parseHexColor(hex: string): Rgba {
  const match = /^#?([\da-f]{6})$/iu.exec(hex.trim());
  if (!match) throw new Error(`unsupported color: ${hex}`);
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff, 0xff];
}

/**
 * Decodes a raw `game_tick` response. The resolution is derived from the
 * payload length because SUPER-CHIP programs can switch modes mid-session.
 */
export function decodeGameFrame(buffer: ArrayBuffer | Uint8Array): GameFrame {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const payload = bytes.length - FRAME_HEADER_BYTES;
  if (payload !== LOW_FRAME_BYTES && payload !== HIGH_FRAME_BYTES) {
    throw new Error(`unexpected game frame: ${bytes.length} bytes`);
  }
  const flags = bytes[0];
  const hires = payload === HIGH_FRAME_BYTES;
  return {
    cols: hires ? 128 : 64,
    rows: hires ? 64 : 32,
    dirty: (flags & FRAME_FLAG_DIRTY) !== 0,
    hires,
    sound: (flags & FRAME_FLAG_SOUND) !== 0,
    waitingKey: (flags & FRAME_FLAG_WAIT_KEY) !== 0,
    halted: (flags & FRAME_FLAG_HALTED) !== 0,
    pixels: bytes.subarray(FRAME_HEADER_BYTES),
  };
}

/**
 * Expands packed rows-major MSB-first pixels into RGBA bytes for `ImageData`.
 * `target` must hold `cols * rows * 4` bytes.
 */
export function expandFrame(
  frame: GameFrame,
  target: Uint8ClampedArray,
  on: Rgba,
  off: Rgba
): void {
  const [onR, onG, onB, onA] = on;
  const [offR, offG, offB, offA] = off;
  const { cols, rows, pixels } = frame;
  const wordsPerRow = cols / 8;
  let offset = 0;
  for (let row = 0; row < rows; row += 1) {
    const rowStart = row * wordsPerRow;
    for (let word = 0; word < wordsPerRow; word += 1) {
      const bits = pixels[rowStart + word];
      for (let bit = 0; bit < 8; bit += 1) {
        const lit = (bits & (0x80 >> bit)) !== 0;
        target[offset] = lit ? onR : offR;
        target[offset + 1] = lit ? onG : offG;
        target[offset + 2] = lit ? onB : offB;
        target[offset + 3] = lit ? onA : offA;
        offset += 4;
      }
    }
  }
}

/** Counts lit pixels; used by benchmarks and tests, not by the render path. */
export function countLitPixels(frame: GameFrame): number {
  let count = 0;
  for (const byte of frame.pixels) {
    let bits = byte;
    while (bits !== 0) {
      count += bits & 1;
      bits >>= 1;
    }
  }
  return count;
}

/** Safe variant of {@link parseHexColor} for palette wiring at module scope. */
export function tryParseHexColor(hex: string, fallback: Rgba): Rgba {
  const [value, error] = attemptSync(() => parseHexColor(hex));
  return error === null ? value : fallback;
}
