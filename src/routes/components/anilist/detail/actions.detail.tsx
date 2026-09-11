import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { cn } from "cn";
import { Check, Heart, Link2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { SmallLoader } from "@/components/shared/loader.component";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import { buildAnimeLink } from "@/lib/utils/deeplink.utils";
import type { QuickAddListEntry, QuickAddMedia } from "@/types/collection";

import QuickAddButton from "./quickadd.detail";

export function DetailHeaderActions({
  isFavorite,
  trailerId,
  onTrailer,
  anime,
  listEntry,
}: {
  isFavorite: boolean;
  trailerId: string | null;
  onTrailer?: (id: string) => void;
  anime: QuickAddMedia;
  listEntry?: QuickAddListEntry;
}) {
  const { t } = useI18n();
  if (trailerId === null) return null;
  return (
    <div className="flex flex-row gap-2">
      <Button className="h-5 shrink-0 px-1 text-xs" onClick={() => onTrailer?.(trailerId)}>
        {t("anilist.details.trailer")}
      </Button>
      <QuickAddButton anime={anime} listEntry={listEntry} isFavorite={isFavorite} />
    </div>
  );
}

export function FavHeartButton({
  isFavorite,
  loading,
  onToggle,
}: {
  isFavorite: boolean;
  loading: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      disabled={loading}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      title={isFavorite ? t("anilist.details.remove.fav") : t("anilist.details.add.fav")}
      aria-label={isFavorite ? t("anilist.details.remove.fav") : t("anilist.details.add.fav")}
      className="windows95-active-border bg-primary text-text windows95-text flex size-5 cursor-pointer items-center justify-center hover:brightness-110 active:translate-x-px active:translate-y-px disabled:cursor-default disabled:brightness-90"
    >
      {loading ? (
        <SmallLoader size={2} />
      ) : (
        <Heart className={cn("size-2.5", isFavorite ? "fill-red-500 text-red-500" : "text-text")} />
      )}
    </button>
  );
}

export function CopyLinkButton({ animeId }: { animeId: number }) {
  const { t } = useI18n();
  const [linkCopied, setLinkCopied] = useState(false);
  const copiedTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
    },
    []
  );
  const copyLink = () => {
    writeText(buildAnimeLink(animeId));
    setLinkCopied(true);
    if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setLinkCopied(false), 1500);
  };
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        copyLink();
      }}
      title={t("anilist.details.copy.link")}
      aria-label={t("anilist.details.copy.link")}
      className="windows95-active-border bg-primary text-text windows95-text flex size-5 cursor-pointer items-center justify-center hover:brightness-110 active:translate-x-px active:translate-y-px"
    >
      {linkCopied ? <Check className="size-2.5" /> : <Link2 className="size-2.5" />}
    </button>
  );
}
