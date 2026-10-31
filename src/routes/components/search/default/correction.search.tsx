import { useEffect, useState } from "react";

import { anilistApi } from "@/api/anilist.api";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { useDebouncedValue } from "@/hooks/pacer.hook";
import type { TorrentCoverState } from "@/types/search/searchCover";
import { queryKeys } from "@/lib/core/keys.utils";
import { mediaToCandidate } from "@/lib/core/cover.utils";
import { reportBackgroundError } from "@/lib/core/attempt.utils";
import CoverCandidateThumb from "@/routes/components/search/default/candidate.search";
import {
  learnCoverAlias,
  rejectCoverCandidate,
  removeCoverOverride,
  setCoverOverride,
} from "@/store/cover.store";
import type { AniMedia } from "@/types/anilist/anilist";

const MANUAL_DEBOUNCE_MS = 400;

export default function CoverCorrectionModal({
  torrentTitle,
  cover,
  onClose,
}: {
  torrentTitle: string;
  cover: TorrentCoverState;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [selectedId, setSelectedId] = useState<number | null>(cover.anilistId);
  const [query, setQuery] = useState<string>("");
  const [debouncedQuery] = useDebouncedValue(query.trim(), { wait: MANUAL_DEBOUNCE_MS });
  const manualQuery = useAppQuery("slow", {
    queryKey: queryKeys.coverManualSearch(debouncedQuery),
    queryFn: async () => {
      const data = await anilistApi.search<AniMedia>({ query: debouncedQuery, perPage: 5 });
      return data.map(mediaToCandidate);
    },
    enabled: debouncedQuery.length >= 2,
    placeholderData: (previous) => previous,
  });
  useEffect(() => {
    if (manualQuery.error) reportBackgroundError("cover.manual.search", manualQuery.error);
  }, [manualQuery.error]);
  const manual = manualQuery.data ?? [];

  const picked = cover.candidates;
  const fresh = manual.filter((candidate) => !picked.some((entry) => entry.id === candidate.id));

  const apply = (): void => {
    const selected = [...picked, ...fresh].find((candidate) => candidate.id === selectedId);
    if (!selected) return;
    if (cover.anilistId && cover.anilistId !== selected.id) {
      rejectCoverCandidate(cover.coverKey, cover.anilistId);
    }
    setCoverOverride(cover.coverKey, {
      id: selected.id,
      coverUrl: selected.coverUrl ?? null,
      title: selected.romaji,
      at: Date.now(),
    });
    learnCoverAlias(cover.coverKey, selected.romaji);
    onClose();
  };

  const clearManual = (): void => {
    removeCoverOverride(cover.coverKey);
    onClose();
  };

  const applyOnEnter = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Enter" && selectedId !== null) apply();
  };

  return (
    <Modal header={t("search.cover.correct.title")} onClose={onClose} className="w-xl">
      <p className="windows95-text text-hint truncate text-xs" title={torrentTitle}>
        {t("search.cover.correct.for")} {torrentTitle}
      </p>
      <Input
        autoFocus
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={applyOnEnter}
        placeholder={t("search.cover.correct.find")}
        aria-label={t("search.cover.correct.find")}
      />
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {picked.length === 0 && fresh.length === 0 ? (
          <span className="windows95-text text-hint text-xs">
            {t("search.cover.correct.empty")}
          </span>
        ) : (
          <>
            {picked.length > 0 && (
              <section className="flex flex-col gap-1">
                <h4 className="windows95-font text-hint text-xs font-bold">
                  {t("search.cover.correct.suggested")}
                </h4>
                <div className="flex flex-wrap gap-1">
                  {picked.map((candidate) => (
                    <CoverCandidateThumb
                      key={candidate.id}
                      candidate={candidate}
                      selected={candidate.id === selectedId}
                      current={candidate.id === cover.anilistId}
                      onSelect={setSelectedId}
                      onApply={apply}
                    />
                  ))}
                </div>
              </section>
            )}
            {fresh.length > 0 && (
              <section className="flex flex-col gap-1">
                <h4 className="windows95-font text-hint text-xs font-bold">
                  {t("search.cover.correct.found")}
                </h4>
                <div className="flex flex-wrap gap-1">
                  {fresh.map((candidate) => (
                    <CoverCandidateThumb
                      key={candidate.id}
                      candidate={candidate}
                      selected={candidate.id === selectedId}
                      current={candidate.id === cover.anilistId}
                      onSelect={setSelectedId}
                      onApply={apply}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
      <p className="windows95-text text-hint text-xs">{t("search.cover.correct.remembered")}</p>
      <div className="flex items-center justify-between gap-1">
        {cover.status === "override" ? (
          <Button onClick={clearManual}>{t("search.cover.correct.clear")}</Button>
        ) : (
          <span />
        )}
        <div className="flex gap-1">
          <Button onClick={onClose}>{t("search.cover.correct.cancel")}</Button>
          <Button onClick={apply} disabled={!selectedId}>
            {t("search.cover.correct.apply")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
