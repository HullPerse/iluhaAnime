import { PreviewCard } from "@base-ui/react/preview-card";
import { cn } from "cn";
import { Heart } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";

/**
 * One poster tile for characters, staff and media. Every list used to draw its own: four
 * sizes, four label rules, and only one of them showed favourites at all. Going through
 * `Button` is what gives tiles the app's focus ring and press effect, which the old
 * `role="button"` divs did not have.
 *
 * Portrait-first: 3:4 covers, 64px wide by default and 80px for the character and staff grids.
 */
const TILE_WIDTHS = {
  md: "w-16",
  lg: "w-20",
} as const;

/** Hover intent: long enough not to flash while the pointer crosses the grid, short enough to
 * feel like a tooltip. */
const PREVIEW_DELAY = 250;
const PREVIEW_CLOSE_DELAY = 100;

export type PosterTileSize = keyof typeof TILE_WIDTHS;

/**
 * Card content, or a function of a `close` callback for cards that navigate: the card floats over
 * whatever the click opens, so it has to dismiss itself instead of waiting for the pointer.
 */
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
  /** Second line under the name, for a role, a language or a rating. */
  sublabel?: string;
  favourite?: boolean;
  /** Short corner mark, e.g. a recommendation weight. */
  badge?: string;
  size?: PosterTileSize;
  onSelect?: () => void;
  title?: string;
  /** Extra detail for a hover card. Without it the tile stays a plain button. */
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
      // A hover card already says more than the browser tooltip would, and two of them at once
      // is noise. Without a card the tooltip carries the extra detail instead.
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
      {/* The name area is two lines tall whatever the name length is: without it a one-line
          name pulls its tile up and the row of portraits stops lining up. */}
      <span className="windows95-text line-clamp-2 h-8 w-full text-center text-xs leading-tight font-bold break-words">
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

  if (preview === undefined) {
    return tile;
  }

  const content = typeof preview === "function" ? preview(() => setPreviewOpen(false)) : preview;

  return (
    // Open state is held here rather than inside the primitive so a card can close itself when one
    // of its entries is clicked, while hover and keyboard focus keep opening it as before.
    <PreviewCard.Root open={previewOpen} onOpenChange={setPreviewOpen}>
      <PreviewCard.Trigger render={tile} delay={PREVIEW_DELAY} closeDelay={PREVIEW_CLOSE_DELAY} />
      <PreviewCard.Portal>
        <PreviewCard.Positioner
          // The card lives on the page root, so it needs to clear both the modals (z-50) and the
          // AniList overlay window (z-90) it is opened from.
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
