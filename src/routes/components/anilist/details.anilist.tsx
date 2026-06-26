import { invoke } from "@tauri-apps/api/core";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useSearchStore } from "@/store/search.store";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { Loader, Search, Save } from "lucide-react";
import type { AniMedia } from "@/types/anilist";
import {
  formatLabels,
  listStatusOptions,
  seasonLabels,
  statusLabels,
} from "@/config/anilist.config";

function AniListDetailModal({
  animeId,
  listEntry,
  isLoggedIn,
  onClose,
  onSaved,
}: {
  animeId: number;
  listEntry?: {
    progress: number | null;
    score: number | null;
    list_status: string;
  };
  isLoggedIn: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const setCrossSearchQuery = useSearchStore((s) => s.setCrossSearchQuery);

  const { data: anime, isLoading } = useQuery({
    queryKey: ["anime_detail", animeId],
    queryFn: () => invoke<AniMedia>("get_anime_by_id", { id: animeId }),
  });

  const [editStatus, setEditStatus] = useState(
    listEntry?.list_status ?? "PLANNING",
  );
  const [editProgress, setEditProgress] = useState(
    listEntry?.progress?.toString() ?? "",
  );
  const [editScore, setEditScore] = useState(
    listEntry?.score?.toString() ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const handleSearchTorrents = (query?: string) => {
    setCrossSearchQuery(query ?? anime?.title ?? "");
    onClose();
  };

  const handleSave = async () => {
    if (!anime) return;
    setSaving(true);
    setSaveError("");
    try {
      await invoke("save_anilist_entry", {
        mediaId: anime.id,
        status: editStatus,
        progress: editProgress ? parseInt(editProgress, 10) : null,
        score: editScore ? parseInt(editScore, 10) : null,
      });
      onSaved?.();
      onClose();
    } catch {
      setSaveError("Не удалось сохранить");
      setSaving(false);
    }
  };

  return (
    <Modal header={anime?.title ?? "Загрузка..."} onClose={onClose}>
      {isLoading || !anime ? (
        <div className="flex items-center justify-center flex-1">
          <Loader className="size-6 animate-spin windows95-text" />
        </div>
      ) : (
        <div className="flex flex-col gap-2 overflow-y-auto min-h-0 flex-1 pb-1">
          {/* Cover + Metadata row */}
          <div className="flex flex-row gap-3">
            {anime.cover_url && (
              <img
                src={anime.cover_url}
                alt={anime.title}
                className="w-36 shrink-0 windows95-active-border self-start"
              />
            )}
            <div className="flex flex-col gap-1.5 min-w-0 flex-1">
              <div className="flex flex-wrap gap-1 items-center">
                {anime.score && (
                  <span className="text-[11px] windows95-font px-1 bg-secondary text-white font-bold">
                    ★ {anime.score}
                  </span>
                )}
                <span className="text-[11px] windows95-font windows95-text">
                  {statusLabels[anime.status] ?? anime.status}
                </span>
                {anime.format && (
                  <span className="text-[10px] windows95-font px-1 bg-primary windows95-border text-text">
                    {formatLabels[anime.format] ?? anime.format}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] windows95-text">
                {anime.episodes && <span>{anime.episodes} эп.</span>}
                {anime.duration && <span>по {anime.duration} мин.</span>}
                {anime.season && (
                  <span>
                    {seasonLabels[anime.season] ?? anime.season}{" "}
                    {anime.season_year}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px]">
                {anime.start_date && (
                  <span className="windows95-text">с {anime.start_date}</span>
                )}
                {anime.end_date && anime.status === "FINISHED" && (
                  <span className="windows95-text">по {anime.end_date}</span>
                )}
              </div>
              {anime.next_episode && anime.next_airing_at && (
                <span className="text-[11px] text-success font-bold">
                  {anime.next_episode} серия ·{" "}
                  {new Date(anime.next_airing_at * 1000).toLocaleDateString(
                    "ru-RU",
                  )}
                </span>
              )}
            </div>
          </div>

          {/* Studios */}
          {anime.studios.length > 0 && (
            <div className="windows95-border">
              <div className="bg-secondary text-white windows95-font font-bold text-[10px] px-1 py-0.5">
                Студии
              </div>
              <div className="flex flex-wrap gap-1 p-1">
                {anime.studios.map((s) => (
                  <span
                    key={s}
                    className="px-1 text-[10px] windows95-font bg-primary windows95-border text-text"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          {anime.description && (
            <div className="windows95-border">
              <div className="bg-secondary text-white windows95-font font-bold text-[10px] px-1 py-0.5">
                Описание
              </div>
              <div className="text-[11px] windows95-text leading-relaxed max-h-36 overflow-y-auto p-1 whitespace-pre-line">
                {anime.description}
              </div>
            </div>
          )}

          {/* Genres + Tags */}
          {(anime.genres.length > 0 || anime.tags.length > 0) && (
            <div className="windows95-border">
              <div className="bg-secondary text-white windows95-font font-bold text-[10px] px-1 py-0.5">
                Жанры и теги
              </div>
              <div className="flex flex-wrap gap-1 p-1">
                {anime.genres.map((g) => (
                  <span
                    key={g}
                    className="px-1 text-[10px] windows95-font bg-secondary text-white font-bold"
                  >
                    {g}
                  </span>
                ))}
                {anime.tags.slice(0, 15).map((t) => (
                  <span
                    key={t}
                    className="px-1 text-[9px] windows95-font bg-primary windows95-border text-text"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* All titles */}
          {anime.titles.length > 0 && (
            <div className="windows95-border">
              <div className="bg-secondary text-white windows95-font font-bold text-[10px] px-1 py-0.5">
                Все названия
              </div>
              <div className="flex flex-col gap-0.5 p-1">
                {anime.titles.map((t) => (
                  <button
                    key={t}
                    onClick={() => handleSearchTorrents(t)}
                    className="text-left text-[10px] windows95-text underline decoration-dotted hover:bg-primary px-0.5 -mx-0.5 cursor-pointer truncate"
                    title="Искать торренты по этому названию"
                  >
                    ◉ {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="windows95-border">
            <div className="bg-secondary text-white windows95-font font-bold text-[10px] px-1 py-0.5">
              Статистика
            </div>
            <div className="flex flex-col gap-0.5 p-1">
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] windows95-text">
                {anime.popularity && (
                  <span>
                    Популярность: #{anime.popularity.toLocaleString("ru-RU")}
                  </span>
                )}
                {anime.favourites && (
                  <span>
                    В избранном: {anime.favourites.toLocaleString("ru-RU")}
                  </span>
                )}
              </div>
              {anime.rankings.length > 0 && (
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] windows95-text">
                  {anime.rankings.map((r, i) => (
                    <span key={i}>
                      {r.type_ === "RATED" ? "★" : "▸"} #{r.rank} в {r.context}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Action controls */}
          {isLoggedIn && (
            <div className="windows95-border">
              <div className="bg-secondary text-white windows95-font font-bold text-[10px] px-1 py-0.5">
                {listEntry ? "Управление списком" : "Добавить в список"}
              </div>
              <div className="flex flex-col gap-2 p-1.5">
                <div className="flex flex-row gap-2 items-center text-[11px] windows95-text">
                  <span className="w-20 shrink-0">Статус:</span>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="flex-1 windows95-border bg-primary text-text windows95-font text-[11px] px-1 py-0.5"
                  >
                    {listStatusOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-row gap-2 items-center text-[11px] windows95-text">
                  <span className="w-20 shrink-0">Прогресс:</span>
                  <Input
                    type="number"
                    min={0}
                    max={anime.episodes ?? 9999}
                    value={editProgress}
                    onChange={(e) => setEditProgress(e.target.value)}
                    className="w-20 h-7 text-[11px]"
                  />
                  {anime.episodes && (
                    <span className="text-[10px] windows95-text">
                      / {anime.episodes} эп.
                    </span>
                  )}
                </div>
                <div className="flex flex-row gap-2 items-center text-[11px] windows95-text">
                  <span className="w-20 shrink-0">Оценка:</span>
                  <select
                    value={editScore}
                    onChange={(e) => setEditScore(e.target.value)}
                    className="windows95-border bg-primary text-text windows95-font text-[11px] px-1 py-0.5"
                  >
                    <option value="">—</option>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <span className="text-[10px] windows95-text">/ 10</span>
                </div>
                {saveError && (
                  <span className="text-[10px] font-bold text-destructive">
                    {saveError}
                  </span>
                )}
                <div className="flex flex-row gap-2 justify-end mt-0.5">
                  <Button onClick={handleSave} disabled={saving}>
                    <Save className="size-3" />
                    {saving ? "Сохранение..." : "Сохранить"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-row justify-end gap-2 mt-1">
            <Button variant="default" onClick={() => handleSearchTorrents()}>
              <Search className="size-3" />
              Искать торренты
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default AniListDetailModal;
