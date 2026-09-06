import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { useI18n } from "@/lib/locale/i18n.utils";

import Modal from "./modal.component";

interface InputDialogProps {
  header: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  onSubmit: (value: string) => void;
  onClose: () => void;
}

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
