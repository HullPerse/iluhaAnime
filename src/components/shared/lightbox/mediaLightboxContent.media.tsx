import { FilmstripViewer } from "@/components/shared/filmstrip/viewer.filmstrip";
import type { MediaLightboxContentProps } from "@/types/media";

export function MediaLightboxContent({
  stills,
  trailerYoutubeId,
  trailerLabel,
  initialIndex = 0,
  showTrailerInitially = false,
  onTrailerClick,
  activeTab,
  hideTabs = false,
}: MediaLightboxContentProps) {
  return (
    <FilmstripViewer
      stills={stills}
      trailerYoutubeId={trailerYoutubeId}
      trailerLabel={trailerLabel}
      initialIndex={initialIndex}
      showTrailerInitially={showTrailerInitially}
      onTrailerClick={onTrailerClick}
      activeTab={activeTab}
      hideTabs={hideTabs}
    />
  );
}
