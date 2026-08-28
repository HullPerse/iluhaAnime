import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { useI18n } from "@/lib/i18n";

import Modal from "./modal.component";

interface InputDialogProps {
  header: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  onSubmit: (value: string) => void;
  onClose: () => void;
}

/** Win95 replacement for window.prompt: label + single text field. */
export function InputDialog({
  header,
  label,
  defaultValue = "",
  placeholder,
  onSubmit,
  onClose,
}: InputDialogProps) {
  const { t } = useI18n();
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  return (
    <Modal header={header} onClose={onClose} contentClassName="w-80">
      <label className="flex flex-col gap-1 text-xs">
        {label}
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
        />
      </label>
      <div className="flex justify-end gap-1">
        <Button variant="outline" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button onClick={submit} disabled={!value.trim()}>
          {t("common.ok")}
        </Button>
      </div>
    </Modal>
  );
}

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

/** Win95 replacement for prompt-as-id-list: pick one option from a list. */
export function SelectDialog({
  header,
  label,
  options,
  onSubmit,
  onClose,
}: SelectDialogProps) {
  const { t } = useI18n();
  const [filter, setFilter] = useState("");
  const needle = filter.trim().toLowerCase();
  const visible = needle
    ? options.filter((o) => o.label.toLowerCase().includes(needle))
    : options;

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
      <div className="windows95-border max-h-60 overflow-y-auto bg-white">
        {visible.map((option) => (
          <button
            key={option.value}
            type="button"
            className="windows95-text hover:bg-highlight block w-full cursor-pointer px-2 py-1 text-left text-xs hover:text-white"
            onClick={() => onSubmit(option.value)}
          >
            {option.label}
          </button>
        ))}
        {visible.length === 0 && (
          <p className="text-hint windows95-text p-2 text-xs">
            {t("common.noResults")}
          </p>
        )}
      </div>
    </Modal>
  );
}
