import { useEffect, useRef, useState } from "react";

import { SmallLoader } from "@/components/shared/loader.component";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { useRemoteImage } from "@/hooks/remoteImage.hook";
import { anilistProxyArgs } from "@/lib/anilist/proxy.utils";
import {
  SPOTLIGHT_PER_PAGE,
  SPOTLIGHT_SCORE_FLOOR,
  spotlightBoundaryMs,
  spotlightPageIndex,
  spotlightPeriodKey,
} from "@/lib/anilist/spotlight.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import { readAppCache, writeAppCache } from "@/lib/store/cache.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { formatETA } from "@/lib/utils/time.utils";
import QuickAddButton from "@/routes/components/anilist/detail/quickadd.detail";
import { useSettingsStore } from "@/store/settings.store";
import type { AniMedia, SpotlightKind } from "@/types/anilist";
import type { SpotlightPage } from "@/types/ipc";

const SPOTLIGHT_KINDS: SpotlightKind[] = ["day", "week", "month"];

const SPOTLIGHT_LABELS = {
  day: "anilist.spotlight.day",
  week: "anilist.spotlight.week",
  month: "anilist.spotlight.month",
} as const;

const REFRESH_TICK_MS = 60_000;

type RowState = { status: "loading" } | { status: "ready"; media: AniMedia } | { status: "error" };

async function fetchSpotlightPage(page: number): Promise<SpotlightPage> {
  const proxy = useSettingsStore.getState().anilistProxyUrl;
  return invokeTyped<SpotlightPage>("get_spotlight_page", {
    page,
    perPage: SPOTLIGHT_PER_PAGE,
    scoreFrom: SPOTLIGHT_SCORE_FLOOR,
    ...anilistProxyArgs(proxy),
  });
}

async function resolveSpotlightPick(kind: SpotlightKind, periodKey: string): Promise<AniMedia> {
  const totalRecord = await readAppCache<number>("spotlight", `total:${periodKey}`);
  const first = totalRecord ? null : await fetchSpotlightPage(1);
  const total = totalRecord?.payload ?? first?.total ?? 0;
  const { page, index } = spotlightPageIndex(kind, periodKey, total, SPOTLIGHT_PER_PAGE);
  const pageData = first && page === 1 ? first : await fetchSpotlightPage(page);
  const pick = pageData.media[index % Math.max(1, pageData.media.length)];
  if (!pick) throw new Error("empty spotlight pool");
  return pick;
}

function SpotlightRow({
  media,
  countdown,
  onDetails,
  isFavorite,
}: {
  media: AniMedia;
  countdown: string;
  onDetails: (id: number) => void;
  isFavorite: (id: number) => boolean;
}) {
  const { t } = useI18n();
  const cover = useRemoteImage(media.cover_url);
  const meta = [media.season_year, media.score, ...media.genres.slice(0, 2)]
    .filter((part) => part !== null && part !== undefined && part !== "")
    .join(" · ");
  return (
    <section className="windows95-border flex flex-row gap-2 bg-white p-1">
      {cover ? (
        <img src={cover} alt={media.title} className="h-20 w-14 shrink-0 object-cover" />
      ) : (
        <div className="bg-muted h-20 w-14 shrink-0" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="windows95-text truncate text-xs font-bold">{media.title}</span>
        {meta && <span className="windows95-text text-hint truncate text-xs">{meta}</span>}
        <span className="windows95-text text-hint text-xs">{countdown}</span>
        <div className="mt-auto flex flex-row gap-1">
          <Button className="h-5 px-1 text-xs" onClick={() => onDetails(media.id)}>
            {t("anilist.spotlight.details")}
          </Button>
          <QuickAddButton anime={media} isFavorite={isFavorite(media.id)} />
        </div>
      </div>
    </section>
  );
}

export default function SpotlightModal({
  hasUser,
  onDetails,
  isFavorite,
  onClose,
}: {
  hasUser: boolean;
  onDetails: (id: number) => void;
  isFavorite: (id: number) => boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  const [rows, setRows] = useState<Record<SpotlightKind, RowState>>({
    day: { status: "loading" },
    week: { status: "loading" },
    month: { status: "loading" },
  });
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    const timer = window.setInterval(() => setNow(Date.now()), REFRESH_TICK_MS);
    return () => {
      cancelled.current = true;
      window.clearInterval(timer);
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
      try {
        const media = await resolveSpotlightPick(kind, periodKey);
        if (cancelled.current) return;
        await writeAppCache("spotlight", `pick:${kind}:${periodKey}`, media);
        if (cancelled.current) return;
        setRows((prev) => ({ ...prev, [kind]: { status: "ready", media } }));
      } catch {
        if (cancelled.current) return;
        setRows((prev) => ({ ...prev, [kind]: { status: "error" } }));
      }
    };
    for (const kind of SPOTLIGHT_KINDS) {
      setRows((prev) => ({ ...prev, [kind]: { status: "loading" } }));
      load(kind);
    }
  }, [hasUser]);

  const retry = (kind: SpotlightKind) => {
    setRows((prev) => ({ ...prev, [kind]: { status: "loading" } }));
    const periodKey = spotlightPeriodKey(kind, new Date());
    resolveSpotlightPick(kind, periodKey)
      .then(async (media) => {
        if (cancelled.current) return;
        await writeAppCache("spotlight", `pick:${kind}:${periodKey}`, media);
        if (cancelled.current) return;
        setRows((prev) => ({ ...prev, [kind]: { status: "ready", media } }));
      })
      .catch(() => {
        if (cancelled.current) return;
        setRows((prev) => ({ ...prev, [kind]: { status: "error" } }));
      });
  };

  return (
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
                    onDetails={onDetails}
                    isFavorite={isFavorite}
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
