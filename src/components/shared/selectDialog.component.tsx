import { useRef, useState } from "react";

import { Input } from "@/components/ui/input.component";
import { useI18n } from "@/lib/locale/i18n.utils";

import Modal from "./modal.component";

interface SelectDialogOption {
  value: string;
  label: string;
}

interface SelectDialogProps {
  header: string;
  label: string;
  options: SelectDialogOption[];
  onSubmit: (value: string) => void;
  onClose: () => void;
}

export function SelectDialog({ header, label, options, onSubmit, onClose }: SelectDialogProps) {
  const { t } = useI18n();
  const [filter, setFilter] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const needle = filter.trim().toLowerCase();
  const visible = needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options;
  const focusOption = (index: number) => {
    if (visible.length === 0) return;
    const next = Math.min(Math.max(index, 0), visible.length - 1);
    setActiveIndex(next);
    listRef.current?.querySelectorAll("button")[next]?.focus();
  };

  return (
    <Modal header={header} onClose={onClose} contentClassName="w-80">
      <p className="text-xs">{label}</p>
      {options.length > 6 && (
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("common.search")}
          aria-label={t("common.search")}
        />
      )}
      <div
        ref={listRef}
        className="windows95-border max-h-60 overflow-y-auto bg-white"
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            focusOption(activeIndex + 1);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            focusOption(activeIndex - 1);
          } else if (e.key === "Home") {
            e.preventDefault();
            focusOption(0);
          } else if (e.key === "End") {
            e.preventDefault();
            focusOption(visible.length - 1);
          }
        }}
      >
        {visible.map((option, index) => (
          <button
            key={option.value}
            type="button"
            className={`windows95-text hover:bg-highlight focus-visible:bg-highlight block w-full cursor-pointer px-2 py-1 text-left text-xs hover:text-white focus-visible:text-white focus-visible:outline-none ${index === activeIndex ? "bg-highlight text-white" : ""}`}
            onClick={() => onSubmit(option.value)}
          >
            {option.label}
          </button>
        ))}
        {visible.length === 0 && (
          <p className="text-hint windows95-text p-2 text-xs">{t("common.no.results")}</p>
        )}
      </div>
    </Modal>
  );
}
