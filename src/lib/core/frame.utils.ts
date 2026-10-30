import { attemptSync } from "@/lib/core/attempt.utils";
import type { GameAudioBlock, GameFrame } from "@/types/core/game";
import type { Rgba } from "@/types/core/frame";

/** `game_tick` response layout: 4 header bytes, an optional XO audio block,
 * then the packed framebuffer. */
export const FRAME_HEADER_BYTES = 4;
export const FRAME_FLAG_DIRTY = 0x01;
export const FRAME_FLAG_HIRES = 0x02;
export const FRAME_FLAG_SOUND = 0x04;
export const FRAME_FLAG_WAIT_KEY = 0x08;
export const FRAME_FLAG_HALTED = 0x10;
export const FRAME_FLAG_XO = 0x20;

/** XO audio block: pitch rate (u16 LE) plus the sixteen pattern bytes. */
export const XO_AUDIO_BYTES = 18;

export const LOW_FRAME_BYTES = (64 * 32) / 8;
export const HIGH_FRAME_BYTES = (128 * 64) / 8;
export const LOW_XO_FRAME_BYTES = (64 * 32) / 4;
export const HIGH_XO_FRAME_BYTES = (128 * 64) / 4;

export function parseHexColor(hex: string): Rgba {
  const match = /^#?([\da-f]{6})$/iu.exec(hex.trim());
  if (!match) throw new Error(`unsupported color: ${hex}`);
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff, 0xff];
}

function decodeAudioBlock(bytes: Uint8Array): GameAudioBlock {
  const pitch = new DataView(bytes.buffer, bytes.byteOffset + FRAME_HEADER_BYTES, 2);
  return {
    pitchHz: pitch.getUint16(0, true),
    pattern: bytes.subarray(FRAME_HEADER_BYTES + 2, FRAME_HEADER_BYTES + XO_AUDIO_BYTES),
  };
}

/**
 * Decodes a raw `game_tick` response. The resolution is derived from the
 * payload length because programs can switch modes mid-session, and the XO
 * flag decides whether an audio block and two-bit pixels are present.
 */
export function decodeGameFrame(buffer: ArrayBuffer | Uint8Array): GameFrame {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const flags = bytes[0];
  const xo = (flags & FRAME_FLAG_XO) !== 0;
  const headerBytes = FRAME_HEADER_BYTES + (xo ? XO_AUDIO_BYTES : 0);
  const payload = bytes.length - headerBytes;
  const lowBytes = xo ? LOW_XO_FRAME_BYTES : LOW_FRAME_BYTES;
  const highBytes = xo ? HIGH_XO_FRAME_BYTES : HIGH_FRAME_BYTES;
  if (payload !== lowBytes && payload !== highBytes) {
    throw new Error(`unexpected game frame: ${bytes.length} bytes`);
  }
  const hires = payload === highBytes;
  return {
    cols: hires ? 128 : 64,
    rows: hires ? 64 : 32,
    dirty: (flags & FRAME_FLAG_DIRTY) !== 0,
    hires,
    xo,
    sound: (flags & FRAME_FLAG_SOUND) !== 0,
    waitingKey: (flags & FRAME_FLAG_WAIT_KEY) !== 0,
    halted: (flags & FRAME_FLAG_HALTED) !== 0,
    audio: xo ? decodeAudioBlock(bytes) : null,
    pixels: bytes.subarray(headerBytes),
  };
}

/**
 * Expands packed rows-major MSB-first pixels into RGBA bytes for `ImageData`.
 * One-bit frames use `colors[0]` for an unlit pixel and `colors[1]` for a lit
 * one; XO-CHIP frames read two bits per pixel and map 0-3 to background,
 * first plane, second plane and overlap. `target` must hold `cols * rows * 4`
 * bytes.
 */
export function expandFrame(
  frame: GameFrame,
  target: Uint8ClampedArray,
  colors: readonly Rgba[]
): void {
  const bits = frame.xo ? 2 : 1;
  const paletteSize = 1 << bits;
  if (colors.length < paletteSize) {
    throw new Error(`frame needs ${paletteSize} colors`);
  }
  let offset = 0;
  for (const byte of frame.pixels) {
    for (let shift = 8 - bits; shift >= 0; shift -= bits) {
      const [red, green, blue, alpha] = colors[(byte >> shift) & (paletteSize - 1)];
      target[offset] = red;
      target[offset + 1] = green;
      target[offset + 2] = blue;
      target[offset + 3] = alpha;
      offset += 4;
    }
  }
}

/** Counts lit pixels; used by benchmarks and tests, not by the render path. */
export function countLitPixels(frame: GameFrame): number {
  const bits = frame.xo ? 2 : 1;
  const mask = (1 << bits) - 1;
  let count = 0;
  for (const byte of frame.pixels) {
    for (let shift = 8 - bits; shift >= 0; shift -= bits) {
      if (((byte >> shift) & mask) !== 0) count += 1;
    }
  }
  return count;
}

/** Safe variant of {@link parseHexColor} for palette wiring at module scope. */
export function tryParseHexColor(hex: string, fallback: Rgba): Rgba {
  const [value, error] = attemptSync(() => parseHexColor(hex));
  return error === null ? value : fallback;
}
