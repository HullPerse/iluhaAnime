import { cn } from "cn";

export default function FramesModeArt({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 160 120"
      className={cn("daily-mode-art", className)}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <rect x="24" y="18" width="76" height="58" fill="var(--color-secondary)" />
      <rect x="28" y="22" width="68" height="50" fill="var(--color-field)" />
      <rect x="32" y="26" width="60" height="42" fill="#4fb3c4" />
      <rect x="32" y="52" width="60" height="16" fill="#006666" />
      <rect x="32" y="60" width="60" height="8" fill="#005500" />
      <rect x="84" y="30" width="6" height="6" fill="var(--color-fav-gold)" />

      <rect x="52" y="42" width="84" height="66" fill="var(--color-secondary)" />
      <rect x="56" y="46" width="76" height="58" fill="var(--color-field)" />
      <rect x="60" y="50" width="68" height="46" fill="#4fb3c4" />
      <rect x="60" y="82" width="68" height="14" fill="#005555" />
      <rect x="60" y="90" width="68" height="6" fill="#005500" />
      <rect x="60" y="72" width="12" height="10" fill="#006666" />
      <rect x="68" y="66" width="14" height="16" fill="#006666" />
      <rect x="78" y="76" width="16" height="6" fill="#006666" />
      <rect x="110" y="54" width="10" height="10" fill="var(--color-fav-gold)" />
    </svg>
  );
}
