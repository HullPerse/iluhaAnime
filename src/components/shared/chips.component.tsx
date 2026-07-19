const chipClass =
  "windows95-border px-1 text-[10px] windows95-text cursor-pointer hover:bg-surface bg-white";

function ChipsRow({
  items,
  onRemove,
}: {
  items: string[];
  onRemove: (v: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((v) => (
        <span
          key={v}
          className={chipClass}
          onClick={() => onRemove(v)}
          title="Удалить"
        >
          {v} ✕
        </span>
      ))}
    </div>
  );
}

export default ChipsRow;
