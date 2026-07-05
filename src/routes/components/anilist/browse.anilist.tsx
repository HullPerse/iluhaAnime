import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ChevronLeft, ChevronRight, Loader } from "lucide-react";
import Modal from "@/components/shared/modal.component";
import Tabs from "@/components/shared/tabs.component";
import { Button } from "@/components/ui/button.component";
import {
  getListLabel,
  getStatusColor,
  getStatusLabel,
  seasonLabels,
} from "@/lib/anilist.utils";
import type { AniMedia } from "@/types/anilist";

const PAGE_SIZE = 20;

type BrowseTab = "popular" | "trending" | "top";

const tabs = [
  { id: "popular" as const, label: "Популярное" },
  { id: "trending" as const, label: "Тренды" },
  { id: "top" as const, label: "Топ 100" },
];

const SORT_MAP: Record<BrowseTab, string[]> = {
  popular: ["POPULARITY_DESC"],
  trending: ["TRENDING_DESC"],
  top: ["SCORE_DESC"],
};

export default function BrowseAnimeModal({
  onClose,
  onAnimeClick,
  entries,
}: {
  onClose: () => void;
  onAnimeClick: (id: number) => void;
  entries: Map<
    number,
    {
      progress: number | null;
      score: number | null;
      list_status: string;
    }
  >;
}) {
  const [activeTab, setActiveTab] = useState<BrowseTab>("popular");
  const [data, setData] = useState<AniMedia[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    setPage(1);
    invoke<AniMedia[]>("search_anilist", {
      query: null,
      sort: SORT_MAP[activeTab],
      adult: false,
    })
      .then(setData)
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [activeTab]);

  const total = data.length;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, lastPage);
  const from = (safePage - 1) * PAGE_SIZE;
  const to = Math.min(safePage * PAGE_SIZE, total);
  const paged = data.slice(from, to);

  return (
    <Modal
      header={
        activeTab === "top"
          ? "Топ 100"
          : activeTab === "popular"
            ? "Популярное"
            : "Тренды"
      }
      onClose={onClose}
      className="w-3xl"
    >
      <Tabs
        tabs={tabs}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id)}
      />

      <div className="flex flex-col gap-1 flex-1 overflow-y-auto p-1">
        {loading ? (
          <div className="flex items-center justify-center flex-1">
            <Loader className="size-6 animate-spin windows95-text" />
          </div>
        ) : paged.length === 0 ? (
          <div className="flex items-center justify-center flex-1">
            <span className="windows95-text">Нет результатов</span>
          </div>
        ) : (
          paged.map((item) => {
            const entry = entries.get(item.id);

            return (
              <div
                key={item.id}
                className="flex flex-row windows95-active-border bg-primary p-2 hover:bg-surface hover:cursor-pointer"
                onClick={() => onAnimeClick(item.id)}
              >
                {item.cover_url && (
                  <img
                    src={item.cover_url}
                    alt=""
                    className="w-14 h-20 shrink-0 windows95-active-border object-cover"
                  />
                )}
                <div className="flex flex-col min-w-0 flex-1 ml-2">
                  <span className="flex items-center font-bold windows95-text truncate">
                    {entry && (
                      <span
                        className="windows95-border shrink-0 mt-0.5 mr-0.5"
                        style={{
                          display: "inline-block",
                          width: 10,
                          height: 10,
                          backgroundColor: getStatusColor(entry.list_status),
                        }}
                        title={
                          getListLabel(entry.list_status) ?? entry.list_status
                        }
                      />
                    )}

                    {item.title}
                  </span>
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1 text-[10px] windows95-text">
                    {item.score && (
                      <span className="px-1 bg-secondary text-primary font-bold">
                        ★ {item.score}
                      </span>
                    )}
                    {item.format && (
                      <span className="px-1 bg-white windows95-border">
                        {item.format}
                      </span>
                    )}
                    {item.episodes && <span>{item.episodes} эп.</span>}
                    <span>
                      {getStatusLabel(item.status.toUpperCase()) ?? item.status}
                    </span>
                    {item.season && item.season_year && (
                      <span>
                        {seasonLabels[item.season] ?? item.season}{" "}
                        {item.season_year}
                      </span>
                    )}
                  </div>
                  {item.genres.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {item.genres.slice(0, 4).map((g) => (
                        <span
                          key={g}
                          className="text-[9px] px-1 bg-white windows95-border"
                        >
                          {g}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {total > 0 && (
        <div className="windows95-border bg-white px-1 py-0.5 flex flex-row items-center justify-end gap-1">
          <Button
            size="icon"
            className="h-6 w-6"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage <= 1}
          >
            <ChevronLeft className="size-3" />
          </Button>
          <span className="windows95-text text-[10px]">
            {safePage} / {lastPage}
          </span>
          <Button
            size="icon"
            className="h-6 w-6"
            onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
            disabled={safePage >= lastPage}
          >
            <ChevronRight className="size-3" />
          </Button>
        </div>
      )}
    </Modal>
  );
}
