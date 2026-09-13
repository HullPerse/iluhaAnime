import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Check, Link2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useI18n } from "@/lib/locale/i18n.utils";
import { buildAnimeLink } from "@/lib/utils/deeplink.utils";

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
