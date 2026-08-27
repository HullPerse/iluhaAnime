import { memo } from "react";

import {
  IMG_H,
  NODE_BORDER_COLORS,
  NODE_H,
  NODE_W,
} from "@/config/anilist.config";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/index.utils";
import { enterOrSpace } from "@/lib/keyboard.utils";
import type { FranchiseNode } from "@/types/anilist";

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

const FranNode = memo(
  ({
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
  }) => {
    const { t } = useI18n();
    const isAggregator = node.id < 0;
    return (
      <div
        id={elementId}
        role="button"
        tabIndex={0}
        onClick={() => onRelated?.(node.id)}
        onMouseDown={(e) => onMouseDown?.(e, node.id)}
        onKeyDown={enterOrSpace(() => onRelated?.(node.id))}
        title={
          isAggregator
            ? `${node.title} - ${t("anilist.franchise.expand")}`
            : `${node.title} (${node.year ?? "?"}) - ${node.score ?? "-"} - ${node.format ?? ""}`
        }
        className={cn(
          "windows95-text windows95-active-border bg-primary absolute flex cursor-grab flex-col items-stretch overflow-hidden transition-opacity duration-300 select-none active:cursor-grabbing",
          dimmed && "opacity-30"
        )}
        style={{
          left: x,
          top: y,
          width: dims.w,
          height: dims.h,
          borderColor:
            !isRoot && relationType
              ? (NODE_BORDER_COLORS[relationType] ?? "#bdc3c7")
              : undefined,
        }}
      >
        {isRoot && <div className="bg-secondary h-0.5 w-full shrink-0" />}
        {isAggregator ? (
          <div
            className="windows95-font bg-primary flex items-center justify-center text-center text-xs break-all"
            style={{
              height: dims.imgH,
              color: relationType
                ? (NODE_BORDER_COLORS[relationType] ?? "#bdc3c7")
                : "#bdc3c7",
            }}
          >
            {node.title}
          </div>
        ) : node.cover_url ? (
          <img
            src={node.cover_url}
            alt=""
            className="w-full object-cover"
            style={{ height: dims.imgH }}
            loading="lazy"
          />
        ) : (
          <div
            className="bg-primary text-muted flex items-center justify-center text-xs"
            style={{ height: dims.imgH }}
          >
            -
          </div>
        )}
        {node.format && !isAggregator && (
          <span className="windows95-font absolute top-0 left-0 bg-black/70 px-0.5 text-xs leading-2 text-white">
            {formatShort(node.format)}
          </span>
        )}
        <div
          className={cn(
            "windows95-font flex items-center justify-between overflow-hidden px-1 leading-none",
            isRoot ? "bg-secondary text-white" : "bg-surface text-text"
          )}
          style={{ height: dims.h - dims.imgH }}
        >
          <span className="shrink-0 text-xs">{node.year ?? "?"}</span>
        </div>
      </div>
    );
  }
);

export { FranNode };
