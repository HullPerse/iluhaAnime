import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { parseTimecode } from "@/lib/player/playback.utils";

function JumpToTime({
  onCommit,
  onClose,
}: {
  onCommit: (seconds: number) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState("");
  const [invalid, setInvalid] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    const seconds = parseTimecode(value);
    if (seconds === null) {
      setInvalid(true);
      return;
    }
    onCommit(seconds);
    onClose();
  };

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="windows95-active-border bg-primary flex flex-col gap-1 p-1"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex gap-1">
          <input
            ref={inputRef}
            className="windows95-border w-28 bg-white px-1 text-xs outline-none"
            value={value}
            placeholder={t("player.media.jump.placeholder")}
            aria-label={t("player.media.jump.title")}
            onChange={(event) => {
              setValue(event.target.value);
              setInvalid(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleSubmit();
              if (event.key === "Escape") onClose();
            }}
          />
          <Button size="icon" className="size-6" onClick={handleSubmit}>
            {t("player.media.jump.ok")}
          </Button>
          <Button size="icon" className="size-6" onClick={onClose}>
            <X />
          </Button>
        </div>
        {invalid ? (
          <span className="text-destructive text-xs">{t("player.media.jump.invalid")}</span>
        ) : null}
      </div>
    </div>
  );
}

export default JumpToTime;
