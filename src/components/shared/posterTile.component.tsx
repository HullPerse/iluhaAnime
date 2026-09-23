import { PreviewCard } from "@base-ui/react/preview-card";
import { cn } from "cn";
import { Heart } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";

const TILE_WIDTHS = {
  md: "w-16",
  lg: "w-20",
} as const;

const PREVIEW_DELAY = 250;
const PREVIEW_CLOSE_DELAY = 100;

export type PosterTileSize = keyof typeof TILE_WIDTHS;

export type PosterTilePreview = ReactNode | ((close: () => void) => ReactNode);

export function PosterTile({
  src,
  label,
  alt,
  sublabel,
  favourite = false,
  badge,
  size = "md",
  onSelect,
  title,
  preview,
}: {
  src: string | null;
  label: string;
  alt?: string;
  sublabel?: string;
  favourite?: boolean;
  badge?: string;
  size?: PosterTileSize;
  onSelect?: () => void;
  title?: string;
  preview?: PosterTilePreview;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const hint = title ?? label;
  const tile = (
    <Button
      variant="ghost"
      className={cn(
        "hover:bg-surface flex shrink-0 flex-col items-stretch gap-0.5 p-0.5",
        TILE_WIDTHS[size]
      )}
      onClick={onSelect}
      title={preview === undefined ? hint : undefined}
      aria-label={label}
    >
      <span
        className={cn(
          "relative flex aspect-3/4 w-full overflow-hidden",
          favourite ? "windows95-fav-border" : "windows95-active-border"
        )}
      >
        <ImageComponent src={src ?? ""} alt={alt ?? label} className="h-full w-full" />
        {badge !== undefined && (
          <span className="windows95-text bg-secondary text-title-text absolute top-0 left-0 px-0.5 text-xs leading-tight">
            {badge}
          </span>
        )}
        {favourite && (
          <Heart
            aria-hidden
            className="absolute right-0.5 bottom-0.5 size-3.5 fill-red-500 text-red-500"
          />
        )}
      </span>
      {}
      <span className="windows95-text line-clamp-2 h-8 w-full text-center text-xs leading-tight font-bold wrap-break-word">
        {label}
      </span>
      {sublabel !== undefined && sublabel !== "" && (
        <span
          className="windows95-text text-hint w-full truncate text-center text-xs leading-tight"
          title={sublabel}
        >
          {sublabel}
        </span>
      )}
    </Button>
  );

  if (!preview) return tile;

  const content = typeof preview === "function" ? preview(() => setPreviewOpen(false)) : preview;

  return (
    <PreviewCard.Root open={previewOpen} onOpenChange={setPreviewOpen}>
      <PreviewCard.Trigger render={tile} delay={PREVIEW_DELAY} closeDelay={PREVIEW_CLOSE_DELAY} />
      <PreviewCard.Portal>
        <PreviewCard.Positioner
          className="z-100 outline-none"
          side="top"
          align="center"
          sideOffset={4}
          collisionPadding={8}
        >
          <PreviewCard.Popup className="windows95-border bg-field windows95-text w-48 p-1 outline-none">
            {content}
          </PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </PreviewCard.Root>
  );
}
