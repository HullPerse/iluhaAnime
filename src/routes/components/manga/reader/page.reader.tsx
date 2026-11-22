import { useCell } from "@hullperse/hp_utils/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { fetchMangaPage } from "@/api/manga.api";
import ProgressBar from "@/components/shared/progress.component";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { pageKey } from "@/lib/manga/readerQuery.utils";
import { settingsAtoms } from "@/store/settings.store";

const pageFrames = {
  none: "",
  dark: "outline-2 outline-black",
  light: "outline-2 outline-white",
  shadow: "outline-1 outline-black/50 shadow-[0_6px_24px_#0009]",
  win95:
    "border-2 border-t-win-highlight border-l-win-highlight border-r-win-shadow border-b-win-shadow shadow-[0_0_0_1px_#000]",
  gold: "windows95-fav-border shadow-[0_0_0_1px_#000]",
  inset: "shadow-[inset_0_0_0_1px_#ffffff66,inset_0_0_28px_#000a]",
};

export function ReaderPage({
  manifest,
  page,
  strip,
  half,
  inspect,
  onLoad,
}: {
  manifest: string;
  page: number;
  strip: boolean;
  half?: "left" | "right";
  inspect?: (page: number, wide: boolean) => void;
  onLoad: (page: number) => void;
}) {
  const { t } = useI18n();
  const [progress, setProgress] = useState<{ loaded: number; total: number | null } | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [size, setSize] = useState<{ width: number; height: number }>();
  const brightness = useCell(settingsAtoms.mangaBrightness);
  const frame = useCell(settingsAtoms.mangaReaderFrame);
  const containerWidth = useCell(settingsAtoms.mangaReaderWidth);
  const zoom = useCell(settingsAtoms.mangaReaderZoom);
  const stripWidth = Math.min(100, (containerWidth * zoom) / 100);
  const { data, error, refetch } = useQuery({
    queryKey: pageKey(manifest, page),
    queryFn: () => fetchMangaPage(manifest, page, setProgress),
    staleTime: 120_000,
    gcTime: 30_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    if (!data) return;
    const next = URL.createObjectURL(data);
    setUrl(next);

    return () => URL.revokeObjectURL(next);
  }, [data]);

  if (error) {
    return (
      <div role="alert" className="flex min-h-40 items-center justify-center gap-2">
        {t("manga.reader.pageFailed")}
        <Button
          onClick={async () => {
            await refetch();
          }}
        >
          {t("manga.search.retry")}
        </Button>
      </div>
    );
  }

  if (!url) {
    return (
      <div role="status" className="grid min-h-72 place-content-center gap-2 text-center">
        <span>{t("manga.reader.pageLoading")}</span>
        <ProgressBar
          indeterminate={!progress?.total}
          value={progress?.loaded ?? 0}
          max={progress?.total ?? 1}
          className="h-3 w-40"
          ariaLabel={t("manga.reader.pageLoading")}
        />
      </div>
    );
  }

  const split = size && half && size.width > size.height;

  return (
    <span
      style={
        split
          ? {
              overflow: "clip",
              width: `min(100%, ${size.width / 2}px, ${(size.width / size.height) * 50}dvh)`,
            }
          : strip
            ? { width: `${stripWidth}%`, maxWidth: `${(52 * zoom) / 100}rem` }
            : undefined
      }
      className={strip ? "relative mx-auto grid" : "relative block w-full max-w-full"}
    >
      <img
        src={url}
        alt={t("manga.search.page", { page: page + 1 })}
        className="block h-auto w-full"
        onLoad={(event) => {
          const image = event.currentTarget;

          if (!strip) {
            setSize({ width: image.naturalWidth, height: image.naturalHeight });
            inspect?.(page, image.naturalWidth > image.naturalHeight);
          }

          onLoad(page);
        }}
        style={{
          filter: `brightness(${brightness}%)`,
          ...(split && {
            width: "200%",
            maxWidth: "none",
            transform: half === "right" ? "translateX(-50%)" : undefined,
          }),
        }}
      />
      {pageFrames[frame] && (
        <span
          aria-hidden
          data-manga-page-frame={frame}
          className={`pointer-events-none absolute inset-0 ${pageFrames[frame]}`}
        />
      )}
    </span>
  );
}
