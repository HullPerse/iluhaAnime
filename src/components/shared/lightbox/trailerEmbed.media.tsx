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
