export interface VideoMargins {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface ViewportRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

const MARGIN_EPSILON = 0.001;

export const ZERO_MARGINS: VideoMargins = { top: 0, bottom: 0, left: 0, right: 0 };

/**
 * Converts a measured field rect into mpv video-margin ratios. mpv renders into
 * the whole native window, so the fractions of the viewport above/below/left/
 * right of the video element tell it exactly where the UI bars and side panels
 * are. Values are clamped to [0, 1]: mpv rejects out-of-range margins with
 * `M_RANGE`, and the plugin aborts the whole property batch on the first
 * rejection, which used to leave every margin at zero.
 */
export function computeVideoMargins(
  viewportWidth: number,
  viewportHeight: number,
  rect: ViewportRect | undefined
): VideoMargins {
  if (!rect) return { ...ZERO_MARGINS };
  return {
    top: ratio(rect.top, viewportHeight),
    bottom: ratio(viewportHeight - rect.bottom, viewportHeight),
    left: ratio(rect.left, viewportWidth),
    right: ratio(viewportWidth - rect.right, viewportWidth),
  };
}

function ratio(offset: number, size: number): number {
  if (!(size > 0)) return 0;
  return Math.min(1, Math.max(0, offset / size));
}

export function marginsCloseEnough(a: VideoMargins, b: VideoMargins): boolean {
  return (
    Math.abs(a.top - b.top) < MARGIN_EPSILON &&
    Math.abs(a.bottom - b.bottom) < MARGIN_EPSILON &&
    Math.abs(a.left - b.left) < MARGIN_EPSILON &&
    Math.abs(a.right - b.right) < MARGIN_EPSILON
  );
}

/** Maps margins onto mpv option names, used when seeding `player_init`. */
export function marginOptions(margins: VideoMargins): Record<string, number> {
  return {
    "video-margin-ratio-top": margins.top,
    "video-margin-ratio-bottom": margins.bottom,
    "video-margin-ratio-left": margins.left,
    "video-margin-ratio-right": margins.right,
  };
}
