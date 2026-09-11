import ImageComponent from "@/components/ui/image.component";

export function DragOverlayItem({ name }: { name: string }) {
  return (
    <div className="windows95-text hover:bg-surface windows95-active-border bg-primary windows95-text flex w-full cursor-grab items-center gap-1 px-0.5 py-1 text-left text-xs opacity-80 select-none">
      <ImageComponent src="/images/w2k_folder_closed.ico" alt="" className="size-4 shrink-0" />
      <span className="flex-1 truncate select-none">{name}</span>
    </div>
  );
}
