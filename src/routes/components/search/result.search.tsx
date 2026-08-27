import { Clipboard, Download, Eye } from "lucide-react";

import { SmallLoader } from "@/components/shared/loader.component";
import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { SOURCE_INFOS } from "@/config/search.config";
import { useI18n } from "@/lib/i18n";
import { detectLanguages, formatSize } from "@/lib/index.utils";
import { getLanguageColors } from "@/lib/search.logic";
import type { Anime } from "@/types";

interface Props {
  item: Anime;
  source: string;
  loadingMagnet: Record<string, boolean>;
  onCopyMagnet: (item: Anime) => void;
  onOpenMagnet: (item: Anime) => void;
  onDownload: (item: Anime) => void;
  onOpenLink: (item: Anime) => void;
  onOpenDetails: (item: Anime) => void;
}

export default function SearchResultItem({
  item,
  source,
  loadingMagnet,
  onCopyMagnet,
  onOpenMagnet,
  onDownload,
  onOpenLink,
  onOpenDetails,
}: Props) {
  const isLoadingMag = loadingMagnet[item.link];
  const colors = getLanguageColors();
  const { t } = useI18n();
  const sourceLabel =
    SOURCE_INFOS.find((info) => info.value === source)?.label ?? source;
  const hasMagnet = Boolean(item.magnet) || source === "rutracker";

  return (
    <div className="windows95-active-border bg-primary mb-0.5 px-2 py-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3
            className="windows95-text cursor-pointer truncate leading-tight font-bold hover:underline"
            onClick={() => onOpenDetails(item)}
            title={item.title}
          >
            {item.title}
          </h3>
          <div className="mt-1 flex flex-wrap gap-1">
            <span className="windows95-font bg-secondary px-1 text-xs text-white">
              {sourceLabel}
            </span>
            {detectLanguages(item.title).map((l) => (
              <span
                key={l.code}
                className={`windows95-font px-1 text-xs ${colors[l.code as keyof typeof colors] || "bg-muted text-white"}`}
              >
                {l.label}
              </span>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="windows95-text">{formatSize(item.size)}</span>
          <span className="windows95-text text-success">S:{item.seeders}</span>
          <span className="windows95-text text-destructive">
            L:{item.leechers}
          </span>
        </div>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-1">
        {item.link && (
          <Button
            onClick={() => onOpenDetails(item)}
            size="icon"
            className="windows95-active-border bg-secondary windows95-text inline-flex size-6 cursor-pointer items-center gap-0.5 text-white no-underline"
            title={t("search.more")}
          >
            <Eye className="size-3" />
          </Button>
        )}
        {isLoadingMag ? (
          <div className="flex items-center gap-1">
            <SmallLoader size={3} />
            <span className="windows95-text">{t("search.loadingMagnet")}</span>
          </div>
        ) : hasMagnet ? (
          <>
            <Button
              size="icon"
              onClick={() => onCopyMagnet(item)}
              disabled={loadingMagnet[item.link]}
              className="windows95-active-border bg-primary windows95-text size-5.5"
            >
              <Clipboard />
            </Button>
            <Button
              onClick={() => onOpenMagnet(item)}
              disabled={loadingMagnet[item.link]}
              className="windows95-active-border bg-primary windows95-text text-text px-2 py-0.5 no-underline"
            >
              {t("search.magnet")}
            </Button>
            <Button
              onClick={() => onDownload(item)}
              disabled={loadingMagnet[item.link]}
              className="windows95-active-border bg-primary windows95-text text-text inline-flex cursor-pointer items-center gap-0.5 px-2 py-0.5 no-underline"
            >
              <Download className="size-3" />
              {t("search.download")}
            </Button>
          </>
        ) : (
          item.link && (
            <Button
              onClick={() => onOpenLink(item)}
              className="windows95-active-border bg-primary windows95-text text-text inline-flex cursor-pointer items-center gap-0.5 px-2 py-0.5 no-underline"
            >
              <ImageComponent
                src="/images/w2k_globe.ico"
                alt=""
                className="size-4"
              />
              {t("search.open")}
            </Button>
          )
        )}
      </div>
    </div>
  );
}
