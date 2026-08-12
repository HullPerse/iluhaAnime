import { memo } from "react";
import {
  IMG_H,
  NODE_BORDER_COLORS,
  NODE_H,
  NODE_W,
} from "@/config/anilist.config";
import { cn } from "@/lib/index.utils";
import { FranchiseNode } from "@/types/anilist";

function formatShort(format: string): string {
  const map: Record<string, string> = {
    TV: "TV",
    TV_SHORT: "TVS",
    MOVIE: "MOV",
    SPECIAL: "SP",
    OVA: "OVA",
    ONA: "ONA",
    MUSIC: "MV",
  };
  return map[format] ?? format.slice(0, 3).toUpperCase();
}

const FranNode = memo(function FranNode({
  node,
  x,
  y,
  isRoot,
  onRelated,
  onMouseDown,
  id: elementId,
  dimmed = false,
  relationType,
  dims = { w: NODE_W, h: NODE_H, imgH: IMG_H },
}: {
  node: FranchiseNode;
  x: number;
  y: number;
  isRoot: boolean;
  onRelated?: (id: number) => void;
  onMouseDown?: (e: React.MouseEvent, nodeId: number) => void;
  id?: string;
  dimmed?: boolean;
  relationType?: string;
  dims?: { w: number; h: number; imgH: number };
}) {
  return (
    <div
      id={elementId}
      role="button"
      tabIndex={0}
      onClick={() => onRelated?.(node.id)}
      onMouseDown={(e) => onMouseDown?.(e, node.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onRelated?.(node.id);
        }
      }}
      title={`${node.title} (${node.year ?? "?"}) · ${node.score ?? "—"} · ${node.format ?? ""}`}
      className={cn(
        "absolute flex flex-col items-stretch cursor-grab active:cursor-grabbing select-none overflow-hidden transition-opacity duration-300 windows95-text windows95-active-border bg-primary",
        dimmed && "opacity-30",
      )}
      style={{
        left: x,
        top: y,
        width: dims.w,
        height: dims.h,
        borderColor:
          !isRoot && relationType
            ? NODE_BORDER_COLORS[relationType] ?? "#bdc3c7"
            : undefined,
      }}
    >
      {isRoot && <div className="h-0.5 bg-secondary w-full shrink-0" />}
      {node.cover_url ? (
        <img
          src={node.cover_url}
          alt=""
          className="w-full object-cover"
          style={{ height: dims.imgH }}
          loading="lazy"
        />
      ) : (
        <div
          className="bg-primary flex items-center justify-center text-muted text-xs"
          style={{ height: dims.imgH }}
        >
          -
        </div>
      )}
      {node.format && (
        <span className="absolute top-0 left-0 px-0.5 bg-black/70 text-white text-[7px] leading-[10px] windows95-font">
          {formatShort(node.format)}
        </span>
      )}
      <div
        className={cn(
          "flex items-center justify-between px-1 windows95-font leading-none overflow-hidden",
          isRoot ? "bg-secondary text-white" : "bg-surface text-text",
        )}
        style={{ height: dims.h - dims.imgH }}
      >
        <span className="shrink-0 text-xs">{node.year ?? "?"}</span>
      </div>
    </div>
  );
});

export { FranNode };
