import { useCell } from "@hullperse/hp_utils/react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { useEffect, useRef, useState } from "react";

import { fetchMangaCover } from "@/api/manga.api";
import { settingsAtoms } from "@/store/settings.store";

export function MangaCover({
  src,
  mosaic = false,
  className,
}: {
  src: string | null;
  mosaic?: boolean;
  className?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const element = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState<boolean>(false);
  const [url, setUrl] = useState<string>();
  const remote = src?.startsWith("https://") ?? false;
  const domain = useCell(settingsAtoms.mangaLibRequestDomain);
  const cover = useQuery({
    queryKey: ["manga", "cover", src, domain],
    enabled: remote && visible,
    queryFn: () => fetchMangaCover(src ?? ""),
    staleTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  useEffect(() => {
    if (!remote || !element.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      setVisible(true);
      observer.disconnect();
    });
    observer.observe(element.current);

    return () => observer.disconnect();
  }, [remote]);
  useEffect(() => {
    if (!cover.data) return;
    const next = URL.createObjectURL(cover.data);
    setUrl(next);

    return () => URL.revokeObjectURL(next);
  }, [cover.data]);
  let image: string | null | undefined;

  if (!remote) image = src;
  else if (cover.data) image = url;
  else if (cover.isError) image = src;

  return (
    <span
      ref={element}
      className={cn("bg-surface relative block aspect-3/4 overflow-clip", className)}
    >
      {image && (
        <img
          alt=""
          src={image}
          loading="lazy"
          referrerPolicy="no-referrer"
          className={
            mosaic
              ? "absolute inset-0 h-full w-full object-cover opacity-0"
              : "h-full w-full object-cover"
          }
          onLoad={
            mosaic
              ? (event) => {
                  canvas.current?.getContext("2d")?.drawImage(event.currentTarget, 0, 0, 24, 36);
                }
              : undefined
          }
        />
      )}
      {mosaic && (
        <canvas
          ref={canvas}
          width={24}
          height={36}
          className="daily-audio-mosaic absolute inset-0 h-full w-full"
          aria-hidden
        />
      )}
    </span>
  );
}
