import { cn } from "cn";

export default function OpModeArt({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 160 120"
      className={cn("daily-mode-art", className)}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <rect x="22" y="18" width="116" height="74" fill="var(--color-secondary)" />
      <rect x="26" y="22" width="108" height="66" fill="var(--color-primary)" />
      <rect x="34" y="28" width="92" height="52" fill="var(--color-secondary)" />
      <rect x="38" y="32" width="84" height="44" fill="#004d66" />

      <rect x="70" y="42" width="8" height="24" fill="var(--color-field)" />
      <rect x="78" y="46" width="8" height="16" fill="var(--color-field)" />
      <rect x="86" y="50" width="8" height="8" fill="var(--color-field)" />

      <rect x="116" y="84" width="6" height="4" fill="var(--color-success)" />
      <rect x="66" y="92" width="28" height="8" fill="var(--color-secondary)" />
      <rect x="52" y="100" width="56" height="6" fill="var(--color-secondary)" />
    </svg>
  );
}
