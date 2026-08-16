import { X } from "lucide-react";
import { flushSync } from "react-dom";

import { Button } from "@/components/ui/button.component";

interface Props {
  history: string[];
  show: boolean;
  onSelect: (query: string) => void;
  onRemove: (query: string) => void;
}

export default function SearchHistoryDropdown({
  history,
  show,
  onSelect,
  onRemove,
}: Props) {
  if (!show || history.length === 0) return null;

  return (
    <div className="windows95-border absolute top-full right-0 left-0 z-50 max-h-32 overflow-y-auto bg-white p-0.5">
      {history.map((item, i) => (
        <div key={item} className="flex w-full items-center">
          <Button
            className="windows95-text h-6 flex-1 justify-start font-bold"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              flushSync(() => onSelect(item));
            }}
          >
            {i + 1}. {item}
          </Button>
          <Button
            size="icon"
            className="size-6"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              onRemove(item);
            }}
          >
            <X />
          </Button>
        </div>
      ))}
    </div>
  );
}
