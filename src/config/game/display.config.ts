/**
 * Secret game tab display contract. The canvas keeps the native pixel grid
 * (64x32 low resolution, 128x64 SUPER-CHIP high resolution) and is scaled by
 * whole pixels, so both resolutions stay crisp without resampling.
 */
export const GAME_DISPLAY = {
  /** Lit pixel color of the 1 bpp framebuffer. */
  pixel: "#9be15d",
  /** Unlit pixel color (also the stage background behind the canvas). */
  background: "#0d1608",
  /** Longest accepted frame delta; hides raf gaps after tab switches. */
  maxElapsedMs: 250,
  /** Timer ticks per frame at the VM's 60 Hz timer clock. */
  frameTickMs: 1000 / 60,
  /** Beeps skipped after a hitch; mirrors the Rust per-tick timer cap. */
  maxTimerTicksPerTick: 4,
  /** Telemetry publish interval for the FPS counter. */
  telemetryIntervalMs: 500,
  /** Pixel scale bounds when fitting the stage. */
  minScale: 1,
  maxScale: 32,
} as const;
