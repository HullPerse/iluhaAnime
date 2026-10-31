import { clamp01 } from "@/lib/player/timeline.utils";
import type { BufferedSpan } from "@/lib/player/timeline.utils";

/**
 * The buffered span of a stream.
 *
 * A thin strip stays visible at rest so the stream's health is readable
 * without the cursor; the full-height wash appears only on hover or drag,
 * where a second filled segment cannot be mistaken for a chapter. Nothing is
 * drawn for a local file: `span` is null there.
 */
function BufferedTimeline({
  span,
  duration,
  expanded,
}: {
  span: BufferedSpan | null;
  duration: number;
  expanded: boolean;
}) {
  if (span === null || duration <= 0) return null;
  const left = `${clamp01(span.start / duration) * 100}%`;
  const width = `${clamp01((span.end - span.start) / duration) * 100}%`;

  return (
    <>
      <div
        data-testid="timeline-buffered-track"
        className="bg-muted pointer-events-none absolute bottom-0 h-0.5 opacity-50"
        style={{ left, width }}
      />
      {expanded && (
        <div
          data-testid="timeline-buffered"
          className="bg-muted-trans pointer-events-none absolute inset-y-0"
          style={{ left, width }}
        />
      )}
    </>
  );
}

export default BufferedTimeline;
