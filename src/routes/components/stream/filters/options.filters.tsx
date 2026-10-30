import type { StreamFilterOption } from "@/types/player/stream";

import { ToggleChip } from "@/routes/components/stream/filters/chip.filters";

export function OptionChips({
  options,
  selected,
  onToggle,
}: {
  options: StreamFilterOption[];
  selected: number[];
  onToggle: (id: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((option) => (
        <ToggleChip
          key={option.id}
          active={selected.includes(option.id)}
          label={option.label}
          onToggle={() => onToggle(option.id)}
        />
      ))}
    </div>
  );
}
