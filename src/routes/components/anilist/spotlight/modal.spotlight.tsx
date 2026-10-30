import { useEffect, useRef, useState } from "react";

import { SmallLoader } from "@/components/shared/loader/small.loader";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import {
  SPOTLIGHT_KINDS,
  SPOTLIGHT_LABELS,
  SPOTLIGHT_REFRESH_TICK_MS,
} from "@/config/system/spotlight.config";
import { useI18n } from "@/hooks/i18n.hook";
import type { AnilistScoreFormat } from "@/types/anilist/anilistScore";
import {
  resolveSpotlightPick,
  spotlightBoundaryMs,
  spotlightPeriodKey,
} from "@/lib/core/spotlight.utils";
import { createInterval } from "@/lib/core/interval.utils";
import { readAppCache, writeAppCache } from "@/lib/core/cache.utils";
import { attempt } from "@/lib/core/attempt.utils";
import { formatETA } from "@/lib/core/time.utils";
import type { ActivityDetailBundle } from "@/types/anilist/anilist";
import type { AniMedia, SpotlightKind, SpotlightRowState } from "@/types/anilist/anilist";

import { InlineDetail } from "@/routes/components/anilist/detail/inline.detail";
import { SpotlightRow } from "@/routes/components/anilist/spotlight/spotlightRow.spotlight";

export default function SpotlightModal({
  hasUser,
  isFavorite,
  scoreFormat,
  detail,
  onClose,
}: {
  hasUser: boolean;
  isFavorite: (id: number) => boolean;
  scoreFormat?: AnilistScoreFormat | null;
  detail: ActivityDetailBundle;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  const [detailId, setDetailId] = useState<number | null>(null);
  const [rows, setRows] = useState<Record<SpotlightKind, SpotlightRowState>>({
    day: { status: "loading" },
    week: { status: "loading" },
    month: { status: "loading" },
  });
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    const { cancel } = createInterval(() => setNow(Date.now()), SPOTLIGHT_REFRESH_TICK_MS);
    return () => {
      cancelled.current = true;
      cancel();
    };
  }, []);

  useEffect(() => {
    if (!hasUser) return;
    const load = async (kind: SpotlightKind) => {
      const periodKey = spotlightPeriodKey(kind, new Date());
      const cached = await readAppCache<AniMedia>("spotlight", `pick:${kind}:${periodKey}`);
      if (cancelled.current) return;
      if (cached?.payload) {
        setRows((prev) => ({ ...prev, [kind]: { status: "ready", media: cached.payload } }));
        return;
      }
      const [, error] = await attempt(
        (async () => {
          const media = await resolveSpotlightPick(kind, periodKey);
          if (cancelled.current) return;
          await writeAppCache("spotlight", `pick:${kind}:${periodKey}`, media);
          if (cancelled.current) return;
          setRows((prev) => ({ ...prev, [kind]: { status: "ready", media } }));
        })()
      );
      if (error && !cancelled.current)
        setRows((prev) => ({ ...prev, [kind]: { status: "error" } }));
    };
    for (const kind of SPOTLIGHT_KINDS) {
      setRows((prev) => ({ ...prev, [kind]: { status: "loading" } }));
      load(kind);
    }
  }, [hasUser]);

  const retry = (kind: SpotlightKind) => {
    setRows((prev) => ({ ...prev, [kind]: { status: "loading" } }));
    const periodKey = spotlightPeriodKey(kind, new Date());
    (async () => {
      const [media, error] = await attempt(resolveSpotlightPick(kind, periodKey));
      if (cancelled.current) return;
      if (error || !media) {
        setRows((prev) => ({ ...prev, [kind]: { status: "error" } }));
        return;
      }
      const [, cacheError] = await attempt(
        writeAppCache("spotlight", `pick:${kind}:${periodKey}`, media)
      );
      if (cancelled.current) return;
      if (cacheError) setRows((prev) => ({ ...prev, [kind]: { status: "error" } }));
      else setRows((prev) => ({ ...prev, [kind]: { status: "ready", media } }));
    })();
  };

  return detailId != null ? (
    <InlineDetail
      initialId={detailId}
      detail={detail}
      onBack={() => setDetailId(null)}
      onClose={onClose}
    />
  ) : (
    <Modal header={t("anilist.spotlight.title")} onClose={onClose} className="w-2xl">
      {!hasUser ? (
        <span className="windows95-text p-2 text-xs">{t("anilist.details.login.required")}</span>
      ) : (
        <div className="flex w-full flex-col gap-2 p-1">
          {SPOTLIGHT_KINDS.map((kind) => {
            const row = rows[kind];
            const secs = Math.max(0, Math.round((spotlightBoundaryMs(kind, now) - now) / 1000));
            const countdown =
              secs > 0 ? t("anilist.spotlight.refresh.in", { time: formatETA(secs, t) }) : "";
            return (
              <div key={kind} className="flex flex-col gap-1">
                <span className="windows95-text text-xs font-bold">
                  {t(SPOTLIGHT_LABELS[kind])}
                </span>
                {row.status === "loading" && <SmallLoader size={5} />}
                {row.status === "error" && (
                  <div className="flex flex-row items-center gap-1">
                    <span className="windows95-text text-destructive text-xs">
                      {t("anilist.spotlight.load.error")}
                    </span>
                    <Button className="h-5 px-1 text-xs" onClick={() => retry(kind)}>
                      {t("anilist.spotlight.retry")}
                    </Button>
                  </div>
                )}
                {row.status === "ready" && (
                  <SpotlightRow
                    media={row.media}
                    countdown={countdown}
                    onDetails={setDetailId}
                    isFavorite={isFavorite}
                    scoreFormat={scoreFormat}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
