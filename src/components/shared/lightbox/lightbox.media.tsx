import Modal from "@/components/shared/modal.component";
import { FilmstripViewer } from "@/components/shared/filmstrip.component";
import type { FilmstripTab } from "@/components/shared/filmstrip.component";
import { VideoPlayer } from "@/components/shared/video/player.video";

export function TrailerEmbed({
  youtubeId,
  title,
  className = "aspect-video w-4xl max-w-full",
}: {
  youtubeId: string;
  title: string;
  className?: string;
}) {
  return <VideoPlayer youtubeId={youtubeId} title={title} className={className} />;
}

export interface MediaLightboxContentProps {
  stills: string[];
  trailerYoutubeId: string | null;
  trailerLabel: string;
  initialIndex?: number;
  showTrailerInitially?: boolean;
  onTrailerClick?: () => void;
  activeTab?: FilmstripTab;
  hideTabs?: boolean;
}

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

export function MediaLightbox({
  title,
  onClose,
  onBack,
  ...content
}: MediaLightboxContentProps & {
  title: string;
  onClose: () => void;
  onBack?: () => void;
}) {
  return (
    <Modal header={title} onClose={onClose} onBack={onBack}>
      <MediaLightboxContent {...content} />
    </Modal>
  );
}
