import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Check, Link2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useI18n } from "@/hooks/i18n.hook";
import { Debouncer } from "@/lib/pacer/debounce.utils";
import { buildAnimeLink } from "@/lib/utils/deeplink.utils";
import type { AniListId } from "@/types/types";

export function CopyLinkButton({ animeId }: { animeId: number }) {
  const { t } = useI18n();
  const [linkCopied, setLinkCopied] = useState(false);
  const copyHideRef = useRef<Debouncer<[]> | null>(null);
  useEffect(() => () => copyHideRef.current?.cancel(), []);
  const copyLink = () => {
    writeText(buildAnimeLink(animeId as AniListId));
    setLinkCopied(true);
    if (copyHideRef.current === null) {
      copyHideRef.current = new Debouncer(() => setLinkCopied(false), { wait: 1500 });
    }
    copyHideRef.current.maybeExecute();
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
