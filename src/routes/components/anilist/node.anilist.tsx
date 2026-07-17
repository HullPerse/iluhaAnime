import { IMG_H, NODE_H, NODE_W } from "@/config/anilist.config";
import { cn } from "@/lib/index.utils";
import { FranchiseNode } from "@/types/anilist";

function FranNode({
  node,
  x,
  y,
  isRoot,
  onRelated,
  onMouseDown,
  id: elementId,
}: {
  node: FranchiseNode;
  x: number;
  y: number;
  isRoot: boolean;
  onRelated?: (id: number) => void;
  onMouseDown?: (e: React.MouseEvent, nodeId: number) => void;
  id?: string;
}) {
  return (
    <div
      id={elementId}
      role="button"
      onClick={() => onRelated?.(node.id)}
      onMouseDown={(e) => onMouseDown?.(e, node.id)}
      title={`${node.title} (${node.year ?? "?"})`}
      className={cn(
        "absolute flex flex-col items-stretch cursor-grab active:cursor-grabbing select-none overflow-hidden",
        isRoot ? "ring-2 ring-blue-400" : "ring-1 ring-gray-300",
      )}
      style={{ left: x, top: y, width: NODE_W, height: NODE_H }}
    >
      {node.cover_url ? (
        <img
          src={node.cover_url}
          alt=""
          className="w-full object-cover"
          style={{ height: IMG_H }}
          loading="eager"
        />
      ) : (
        <div
          className="bg-gray-200 flex items-center justify-center text-gray-400 text-xs"
          style={{ height: IMG_H }}
        >
          —
        </div>
      )}
      <div
        className="flex items-center justify-between px-1 bg-black/70 text-white text-[10px] leading-none"
        style={{ height: NODE_H - IMG_H }}
      >
        <span>{node.year ?? "?"}</span>
        <span className="truncate ml-0.5">{node.format ?? ""}</span>
      </div>
    </div>
  );
}

export { FranNode };
