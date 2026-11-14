import { cn } from "cn";

export default function AudioModeArt({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 160 120"
      className={cn("daily-mode-art", className)}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <rect x="22" y="18" width="116" height="74" fill="var(--color-secondary)" />
      <rect x="26" y="22" width="108" height="66" fill="var(--color-primary)" />
      <rect x="34" y="28" width="92" height="52" fill="var(--color-field)" />

      <rect x="48" y="40" width="10" height="28" fill="#4fb3c4" />
      <rect x="63" y="34" width="10" height="40" fill="#4fb3c4" />
      <rect x="78" y="46" width="10" height="18" fill="#4fb3c4" />
      <rect x="93" y="38" width="10" height="32" fill="#4fb3c4" />
      <rect x="108" y="44" width="10" height="20" fill="#4fb3c4" />

      <rect x="62" y="84" width="36" height="8" fill="var(--color-secondary)" />
      <rect x="52" y="92" width="56" height="6" fill="var(--color-secondary)" />
      <rect x="116" y="84" width="6" height="4" fill="var(--color-fav-gold)" />
    </svg>
  );
}
