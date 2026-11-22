import { useState } from "react";

import { SmallLoader } from "@/components/shared/loader/small.loader";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import type { DailyFrameView } from "@/types/api/daily";

export default function FramesReveal({
  frames,
  maxAttempts,
  error,
  retrying,
  onRetry,
  onDone,
}: {
  frames: DailyFrameView[];
  maxAttempts: number;
  error: Error | null;
  retrying: boolean;
  onRetry: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [openSlot, setOpenSlot] = useState<number | null>(null);
  const openFrame = openSlot === null ? undefined : frames.find((frame) => frame.slot === openSlot);

  return (
    <section className="daily-reveal">
      <div className="daily-frames-grid">
        {Array.from({ length: maxAttempts }, (_, slot) => {
          const frame = frames.find((item) => item.slot === slot);
          const label = t("collection.game.frames.preview", { slot: slot + 1 });

          return (
            <button
              key={slot}
              type="button"
              className="windows95-border daily-reveal-frame-shell daily-reveal-frame-button"
              onClick={() => setOpenSlot(slot)}
              disabled={frame === undefined}
              aria-label={label}
              title={label}
            >
              {frame !== undefined ? (
                <img src={frame.dataUrl} alt="" className="daily-reveal-frame" />
              ) : (
                <span className="daily-reveal-frame daily-reveal-placeholder">
                  <SmallLoader size={6} />
                </span>
              )}
            </button>
          );
        })}
      </div>
      {(error !== null || (!retrying && frames.length < maxAttempts)) && (
        <div className="daily-reveal-error" role="alert">
          <span>{error?.message ?? t("collection.game.frames.error")}</span>
          <Button onClick={onRetry} loading={retrying}>
            {t("collection.retry")}
          </Button>
        </div>
      )}
      <div className="daily-reveal-actions">
        <Button className="daily-submit bg-secondary text-title-text" onClick={onDone}>
          {t("collection.game.toResult")}
        </Button>
      </div>
      {openFrame !== undefined && (
        <Modal
          header={t("collection.game.frames.preview", { slot: openFrame.slot + 1 })}
          onClose={() => setOpenSlot(null)}
          className="w-[min(92vw,80rem)]"
          contentClassName="items-center p-2"
        >
          <div className="flex aspect-video max-h-[72vh] w-full items-center justify-center bg-black">
            <img src={openFrame.dataUrl} alt="" className="h-full w-full object-contain" />
          </div>
        </Modal>
      )}
    </section>
  );
}
