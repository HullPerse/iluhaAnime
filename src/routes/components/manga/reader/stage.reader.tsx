import type { ComponentProps } from "react";
import type { readerModes } from "@/config/manga/reader.config";
import { PagedReader } from "@/routes/components/manga/reader/paged.reader";
import { ReaderManifestStatus } from "@/routes/components/manga/reader/manifestStatus.reader";
import { Strip } from "@/routes/components/manga/reader/strip.reader";

export function ReaderStage({
  data,
  ready,
  strip,
  current,
  initialOffset,
  jump,
  gap,
  mode,
  pair,
  spread,
  half,
  inspect,
  step,
  failed,
  onRetry,
  onPage,
  onLoad,
  onOffset,
}: {
  data: { key: string; count: number } | undefined;
  ready: boolean;
  strip: boolean;
  current: number;
  initialOffset: number;
  jump: { index: number; token: number };
  gap: number;
  mode: (typeof readerModes)[number];
  pair: ComponentProps<typeof PagedReader>["pair"];
  spread: ComponentProps<typeof PagedReader>["spread"];
  half: ComponentProps<typeof PagedReader>["half"];
  inspect: ComponentProps<typeof PagedReader>["inspect"];
  step: ComponentProps<typeof PagedReader>["step"];
  failed: boolean;
  onRetry: () => Promise<unknown>;
  onPage: ComponentProps<typeof Strip>["onPage"];
  onLoad: ComponentProps<typeof Strip>["onLoad"];
  onOffset: ComponentProps<typeof PagedReader>["onOffset"];
}) {
  if (!data || !ready) return <ReaderManifestStatus failed={failed} onRetry={onRetry} />;

  return strip ? (
    <Strip
      current={current}
      initialOffset={initialOffset}
      jump={jump}
      count={data.count}
      manifest={data.key}
      gap={gap}
      onPage={onPage}
      onLoad={onLoad}
    />
  ) : (
    <PagedReader
      mode={mode}
      page={current}
      manifest={data.key}
      pair={pair}
      spread={spread}
      half={half}
      inspect={inspect}
      step={step}
      onLoad={onLoad}
      onOffset={onOffset}
    />
  );
}
