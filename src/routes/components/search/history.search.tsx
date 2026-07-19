import { Button } from "@/components/ui/button.component";
import { X } from "lucide-react";
import { flushSync } from "react-dom";

interface Props {
  history: string[];
  show: boolean;
  onSelect: (query: string) => void;
  onRemove: (query: string) => void;
}

export default function SearchHistoryDropdown({ history, show, onSelect, onRemove }: Props) {
  if (!show || history.length === 0) return null;

  return (
    <div className="absolute top-full left-0 right-0 z-50 windows95-border bg-white max-h-32 overflow-y-auto p-0.5">
      {history.map((item, i) => (
        <div key={item} className="flex w-full items-center">
          <Button
            className="flex-1 justify-start font-bold windows95-text h-6"
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
