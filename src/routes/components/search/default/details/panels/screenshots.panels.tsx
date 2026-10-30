import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/hooks/i18n.hook";

export function ScreenshotsPanel({
  screenshots,
  onZoom,
}: {
  screenshots: string[];
  onZoom: (url: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-4">
      {screenshots.map((url, index) => (
        <button
          type="button"
          key={`${url}-${index}`}
          className="windows95-border aspect-video min-h-20 cursor-zoom-in bg-black/20 p-0 transition-[filter] hover:brightness-110"
          onClick={() => onZoom(url)}
          title={t("search.details.open.image")}
          aria-label={`${t("search.details.screenshots")} ${index + 1}`}
        >
          <ImageComponent
            src={url}
            alt={`${t("search.details.screenshots")} ${index + 1}`}
            className="h-full w-full"
            type="contain"
          />
        </button>
      ))}
    </div>
  );
}
