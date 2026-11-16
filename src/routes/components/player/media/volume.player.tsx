import { cn } from "cn";
import { Volume, Volume1, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { useKeybindTitle } from "@/hooks/keybindTitle.hook";

import { clamp01 } from "@/lib/player/timeline.utils";

function VolumeControl({
  volume,
  muted,
  onVolume,
  onMute,
  align = "right",
}: {
  volume: number;
  muted: boolean;
  onVolume: (volume: number) => void;
  onMute: () => void;
  align?: "left" | "right";
}) {
  const { t } = useI18n();
  const muteTitle = useKeybindTitle(t("player.media.controls.mute"), "player.toggleMute");
  const [dragging, setDragging] = useState<boolean>(false);
  const volumeRef = useRef<HTMLDivElement>(null);

  const handleVolume = useCallback(
    (clientX: number) => {
      const element = volumeRef.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0) return;
      onVolume(clamp01((clientX - rect.left) / rect.width));
    },
    [onVolume]
  );

  useEffect(() => {
    if (!dragging) return;
    const onMove = (event: PointerEvent) => handleVolume(event.clientX);
    const onUp = () => setDragging(false);
    const previousSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("blur", onUp);
    return () => {
      document.body.style.userSelect = previousSelect;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("blur", onUp);
    };
  }, [dragging, handleVolume]);

  const displayVolume = Number(muted ? 0 : volume);
  const volumeIcon = (() => {
    if (volume === 0 || muted) return <VolumeX />;
    if (volume <= 0.33) return <Volume className="ml-1" />;
    if (volume <= 0.66) return <Volume1 />;
    return <Volume2 />;
  })();

  return (
    <section
      className={cn(
        "border-muted flex h-6 w-fit flex-row gap-1 border-l-2 px-1",
        align === "right" && "ml-auto"
      )}
    >
      <span className="windows95-text flex w-6 max-w-6 min-w-6 items-center text-right">
        {Math.round(displayVolume * 100)}
      </span>
      <Button
        size="icon"
        variant="ghost"
        className="size-6"
        title={muteTitle}
        aria-label={t("player.media.controls.mute")}
        onClick={onMute}
      >
        {volumeIcon}
      </Button>
      <div
        ref={volumeRef}
        role="slider"
        tabIndex={0}
        aria-label={t("player.media.osd.volume")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(displayVolume * 100)}
        onKeyDown={(event) => {
          const delta: Record<string, number> = {
            ArrowLeft: -0.05,
            ArrowDown: -0.05,
            ArrowRight: 0.05,
            ArrowUp: 0.05,
            PageDown: -0.1,
            PageUp: 0.1,
          };
          const target =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? 1
                : delta[event.key] === undefined
                  ? undefined
                  : volume + delta[event.key];
          if (target === undefined) return;
          event.preventDefault();
          event.stopPropagation();
          onVolume(clamp01(target));
        }}
        className="windows95-border bg-field relative w-24 cursor-pointer items-center justify-center"
        onClick={(event) => {
          event.preventDefault();
          handleVolume(event.clientX);
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.focus();
          setDragging(true);
          handleVolume(event.clientX);
        }}
      >
        <div
          className="bg-highlight absolute inset-y-0 left-0"
          style={{ width: `${displayVolume * 100}%` }}
        />
        <div
          className="windows95-active-border bg-primary pointer-events-none absolute top-0 bottom-0 w-2"
          style={{ left: `${displayVolume * 100}%`, transform: "translateX(-50%)" }}
        />
      </div>
    </section>
  );
}

export default VolumeControl;
