import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink, Heart } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/lib/locale/i18n.utils";

export function DetailProfileHeader({
  image,
  name,
  nativeName,
  roleLabel,
  favourites,
  favButton,
  siteUrl,
}: {
  image: string | null;
  name: string;
  nativeName?: string | null;
  roleLabel?: string;
  favourites?: number | null;
  favButton?: ReactNode;
  siteUrl?: string | null;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-row items-start gap-3">
      <section className="windows95-border bg-field flex h-28 w-20 shrink-0 overflow-hidden">
        <ImageComponent src={image ?? ""} alt={name} className="h-full w-full" />
      </section>
      <section className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 className="windows95-text text-sm font-bold break-words">{name}</h3>
        {nativeName != null && nativeName !== "" && (
          <span className="windows95-text text-hint text-xs">{nativeName}</span>
        )}
        <div className="flex flex-wrap items-center gap-1">
          {roleLabel !== undefined && (
            <span className="windows95-text bg-secondary text-title-text px-1 text-xs">
              {roleLabel}
            </span>
          )}
          {favourites != null && (
            <span className="windows95-text windows95-border bg-field flex flex-row items-center gap-0.5 px-1 text-xs">
              <Heart className="size-2.5 fill-red-500 text-red-500" />
              {favourites.toLocaleString()}
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-row items-center gap-1">
          {favButton}
          {siteUrl != null && siteUrl !== "" && (
            <Button
              size="icon"
              className="size-5"
              title={t("anilist.controls.open.site")}
              aria-label={t("anilist.controls.open.site")}
              onClick={() => openUrl(siteUrl)}
            >
              <ExternalLink className="size-3" />
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
