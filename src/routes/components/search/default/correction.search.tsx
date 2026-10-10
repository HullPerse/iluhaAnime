import { useEffect, useState } from "react";

import { anilistApi } from "@/api/anilist.api";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { useI18n } from "@/hooks/i18n.hook";
import type { TorrentCoverState } from "@/hooks/search/cover.hook";
import { mediaToCandidate, type CoverCandidate } from "@/lib/search/cover.utils";
import { attempt, reportBackgroundError } from "@/lib/utils/attempt.utils";
import { showInfo } from "@/lib/utils/notification.utils";
import CoverCandidateThumb from "@/routes/components/search/default/candidate.search";
import {
  learnCoverAlias,
  rejectCoverCandidate,
  removeCoverOverride,
  setCoverOverride,
} from "@/store/cover.store";
import type { AniMedia } from "@/types/anilist";

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
  const [query, setQuery] = useState("");
  const [manual, setManual] = useState<CoverCandidate[]>([]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setManual([]);
      return;
    }
    const timer = setTimeout(() => {
      attempt(anilistApi.search<AniMedia>({ query: trimmed, perPage: 5 })).then(([data, error]) => {
        if (error !== null) {
          reportBackgroundError("cover.manual.search", error);
          return;
        }
        setManual(data.map(mediaToCandidate));
      });
    }, MANUAL_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const picked = cover.candidates;
  const fresh = manual.filter((candidate) => !picked.some((entry) => entry.id === candidate.id));

  const apply = (): void => {
    const selected = [...picked, ...fresh].find((candidate) => candidate.id === selectedId);
    if (!selected) return;
    if (cover.anilistId !== null && cover.anilistId !== selected.id) {
      rejectCoverCandidate(cover.coverKey, cover.anilistId);
    }
    setCoverOverride(cover.coverKey, {
      id: selected.id,
      coverUrl: selected.coverUrl ?? null,
      title: selected.romaji,
      at: Date.now(),
    });
    learnCoverAlias(cover.coverKey, selected.romaji);
    showInfo(t("search.cover.correct.applied"));
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
