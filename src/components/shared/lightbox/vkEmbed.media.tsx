/** VK exposes only a player page, so the video plays in an iframe inside the app. */
export function VkEmbed({
  embedUrl,
  title,
  className = "aspect-video w-full",
}: {
  embedUrl: string;
  title: string;
  className?: string;
}) {
  return (
    <div className={`windows95-active-border bg-black ${className}`}>
      <iframe
        src={embedUrl}
        title={title}
        className="h-full w-full border-0"
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture; storage-access"
        allowFullScreen
      />
    </div>
  );
}
