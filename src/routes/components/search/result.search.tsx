import type { Anime } from "@/types";
import { detectLanguages, formatSize } from "@/lib/index.utils";
import { getLanguageColors } from "@/lib/search.logic";
import { Button } from "@/components/ui/button.component";
import { Clipboard, Download, Loader } from "lucide-react";
import ImageComponent from "@/components/ui/image.component";

interface Props {
  item: Anime;
  source: string;
  loadingMagnet: Record<string, boolean>;
  onCopyMagnet: (item: Anime) => void;
  onOpenMagnet: (item: Anime) => void;
  onDownload: (item: Anime) => void;
  onOpenLink: (item: Anime) => void;
}

export default function SearchResultItem({
  item,
  source,
  loadingMagnet,
  onCopyMagnet,
  onOpenMagnet,
  onDownload,
  onOpenLink,
}: Props) {
  const isLoadingMag = loadingMagnet[item.link];
  const colors = getLanguageColors();

  return (
    <div className="windows95-active-border bg-primary px-2 py-1.5 mb-0.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3
            className="truncate font-bold leading-tight windows95-text"
            title={item.title}
          >
            {item.title}
          </h3>
          <div className="mt-1 flex flex-wrap gap-1">
            {detectLanguages(item.title).map((l) => (
              <span
                key={l.code}
                className={`px-1 text-[10px] windows95-font ${colors[l.code as keyof typeof colors] || "bg-muted text-white"}`}
              >
                {l.label}
              </span>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="windows95-text">{formatSize(item.size)}</span>
          <span className="windows95-text text-success">S:{item.seeders}</span>
          <span className="windows95-text text-destructive">L:{item.leechers}</span>
        </div>
      </div>

      <div className="mt-1 flex gap-1">
        {isLoadingMag ? (
          <div className="flex items-center gap-1">
            <Loader className="size-3 animate-spin" />
            <span className="windows95-text">Загрузка магнита...</span>
          </div>
        ) : item.magnet || source === "rutracker" ? (
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
              className="windows95-active-border bg-primary px-2 py-0.5 windows95-text text-text no-underline"
            >
              Магнит
            </Button>
            <Button
              onClick={() => onDownload(item)}
              disabled={loadingMagnet[item.link]}
              className="inline-flex items-center gap-0.5 windows95-active-border bg-primary px-2 py-0.5 windows95-text text-text no-underline cursor-pointer"
            >
              <Download className="size-3" />
              Скачать
            </Button>
          </>
        ) : (
          item.link && (
            <Button
              onClick={() => onOpenLink(item)}
              className="inline-flex items-center gap-0.5 windows95-active-border bg-primary px-2 py-0.5 windows95-text text-text no-underline cursor-pointer"
            >
              <ImageComponent src="/icons/w2k_globe.ico" alt="" className="size-4" />
              Открыть
            </Button>
          )
        )}
      </div>
    </div>
  );
}
