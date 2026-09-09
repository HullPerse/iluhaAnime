import { memo, useState } from "react";

import { useI18n } from "@/lib/locale/i18n.utils";
import { useRemoteImage } from "@/hooks/remoteImage.hook";

function CoverThumbButton({
  url,
  selected,
  onPick,
}: {
  url: string;
  selected: boolean;
  onPick: (url: string) => void;
}) {
  const { t } = useI18n();
  const src = useRemoteImage(url);
  const [failed, setFailed] = useState(false);
  if (failed || !src) {
    return (
      <div
        className="windows95-border flex h-16 w-12 shrink-0 items-center justify-center bg-white text-center text-xs"
        title={t("image.unavailable")}
      >
        <span className="text-hint">-</span>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onPick(url)}
      className={`windows95-border h-16 w-12 shrink-0 overflow-hidden ${selected ? "outline-secondary outline-2" : ""}`}
    >
      <img
        src={src}
        alt=""
        loading="lazy"
        className="h-full w-full object-cover"
        onError={() => setFailed(true)}
      />
    </button>
  );
}

function CoverThumb({
  url,
  selected,
  onPick,
}: {
  url: string;
  selected: boolean;
  onPick: (url: string) => void;
}) {
  return <CoverThumbButton url={url} selected={selected} onPick={onPick} />;
}

export const MemoCoverThumb = memo(CoverThumb);
