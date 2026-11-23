import { useCell } from "@hullperse/hp_utils/react";
import { ReaderLoupe } from "@/routes/components/manga/reader/loupe.reader";
import { ReaderImageMenu } from "@/routes/components/manga/reader/imageMenu.reader";
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

const stripPageFrames = {
  none: { sides: "", top: "", bottom: "" },
  dark: {
    sides: "border-x-2 border-black",
    top: "border-t-2 border-black",
    bottom: "border-b-2 border-black",
  },
  light: {
    sides: "border-x-2 border-white",
    top: "border-t-2 border-white",
    bottom: "border-b-2 border-white",
  },
  shadow: {
    sides: "border-x border-black/50 shadow-[-8px_0_24px_#0009,8px_0_24px_#0009]",
    top: "border-t border-black/50",
    bottom: "border-b border-black/50",
  },
  win95: {
    sides:
      "border-x-2 border-l-win-highlight border-r-win-shadow shadow-[1px_0_0_#000,-1px_0_0_#000]",
    top: "border-t-2 border-t-win-highlight",
    bottom: "border-b-2 border-b-win-shadow",
  },
  gold: {
    sides: "border-x-2 border-[var(--color-fav-gold,#facc15)] shadow-[1px_0_0_#000,-1px_0_0_#000]",
    top: "border-t-2 border-[var(--color-fav-gold,#facc15)]",
    bottom: "border-b-2 border-[var(--color-fav-gold,#facc15)]",
  },
  inset: {
    sides: "border-x border-white/40 shadow-[inset_1px_0_0_#ffffff66,inset_-1px_0_0_#ffffff66]",
    top: "border-t border-white/40",
    bottom: "border-b border-white/40",
  },
};

function stripFrameClass(frame: keyof typeof stripPageFrames, first: boolean, last: boolean) {
  const design = stripPageFrames[frame];

  return [design.sides, first && design.top, last && design.bottom].filter(Boolean).join(" ");
}

export function ReaderPage({
  manifest,
  page,
  strip,
  first,
  last,
  half,
  inspect,
  onLoad,
}: {
  manifest: string;
  page: number;
  strip: boolean;
  first?: boolean;
  last?: boolean;
  half?: "left" | "right";
  inspect?: (page: number, wide: boolean) => void;
  onLoad: (page: number) => void;
}) {
  const { t } = useI18n();
  const [image, setImage] = useState<HTMLImageElement | null>(null);
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

  if (!url || !data) {
    return (
      <div
        role="status"
        data-manga-loading
        className="grid min-h-72 place-content-center gap-2 text-center"
      >
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
  const frameClass = strip
    ? stripFrameClass(frame, first === true, last === true)
    : pageFrames[frame];

  return (
    <ReaderImageMenu data={data}>
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
          ref={setImage}
          data-manga-image={page}
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
        <ReaderLoupe image={image} />
        {frameClass && (
          <span
            aria-hidden
            data-manga-page-frame={frame}
            className={`pointer-events-none absolute inset-0 ${frameClass}`}
          />
        )}
      </span>
    </ReaderImageMenu>
  );
}
