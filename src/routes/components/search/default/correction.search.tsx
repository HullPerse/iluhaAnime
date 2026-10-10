import { useEffect, useState } from "react";

import { anilistApi } from "@/api/anilist.api";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import type { TorrentCoverState } from "@/hooks/search/cover.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { attempt, reportBackgroundError } from "@/lib/utils/attempt.utils";
import { mediaToCandidate, type CoverCandidate } from "@/lib/search/cover.utils";
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
      attempt(anilistApi.search<AniMedia>({ query: trimmed, perPage: 5 })).then(
        ([data, error]) => {
          if (error !== null) {
            reportBackgroundError("cover.manual.search", error);
            return;
          }
          setManual(data.map(mediaToCandidate));
        }
      );
    }, MANUAL_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const all = [...cover.candidates];
  for (const candidate of manual) {
    if (!all.some((entry) => entry.id === candidate.id)) all.push(candidate);
  }
  const selected = all.find((candidate) => candidate.id === selectedId) ?? null;

  const apply = (): void => {
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

  return (
    <Modal header={t("search.cover.correct.title")} onClose={onClose} className="w-xl">
      <section className="flex max-h-90 flex-col gap-2 overflow-y-auto py-2">
        {all.length === 0 ? (
          <span className="windows95-text text-hint">{t("search.cover.correct.empty")}</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {all.map((candidate) => (
              <CoverCandidateThumb
                key={candidate.id}
                candidate={candidate}
                selected={candidate.id === selectedId}
                onSelect={setSelectedId}
              />
            ))}
          </div>
        )}
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("search.cover.correct.find")}
          aria-label={t("search.cover.correct.find")}
        />
        <div className="flex items-center justify-between gap-1">
          {cover.status === "override" ? (
            <Button onClick={clearManual}>{t("search.cover.correct.clear")}</Button>
          ) : (
            <span />
          )}
          <div className="flex gap-1">
            <Button onClick={onClose}>{t("search.cover.correct.cancel")}</Button>
            <Button onClick={apply} disabled={!selected}>
              {t("search.cover.correct.apply")}
            </Button>
          </div>
        </div>
      </section>
    </Modal>
  );
}
