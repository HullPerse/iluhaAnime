import type { PreviewFrame } from "@/types/core/upscale";
import type { ModalPager } from "@/types/core/ui";

export function zoomedFrameAt(frames: PreviewFrame[], index: number | null): PreviewFrame | null {
  if (index === null) return null;
  return frames[index] ?? null;
}

export function framePager(
  frames: PreviewFrame[],
  index: number | null,
  label: string,
  setIndex: (updater: (prev: number | null) => number | null) => void
): ModalPager | undefined {
  if (index === null || frames.length < 2) return undefined;
  const step = (delta: number) => () =>
    setIndex((prev) => (prev === null ? prev : (prev + delta + frames.length) % frames.length));
  return {
    index,
    total: frames.length,
    label,
    onPrevious: step(-1),
    onNext: step(1),
  };
}
