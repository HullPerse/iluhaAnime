import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { Loader, Star } from "lucide-react";
import Modal from "@/components/shared/modal.component";
import Tabs from "@/components/shared/tabs.component";
import {
  listStatusLabels,
  seasonLabels,
  statusLabels,
} from "@/config/anilist.config";
import { getStatusColor } from "@/lib/anilist.utils";
import type { AniMedia } from "@/types/anilist";
import ImageComponent from "@/components/ui/image.component";
import { usePagination, paginate } from "@/hooks/pagination.hook";
import AniListPaginationBar from "@/routes/components/anilist/pagination.anilist";

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
  const [page, setPage] = useState(1);

  const { data = [], isLoading } = useQuery({
    queryKey: ["anilist_browse", activeTab],
    queryFn: () =>
      invoke<AniMedia[]>("search_anilist", {
        query: null,
        sort: SORT_MAP[activeTab],
        adult: false,
      }),
  });

  const { total, from, to, lastPage } = usePagination(
    data.length,
    PAGE_SIZE,
    page,
    setPage,
  );
  const paged = paginate(data, page, PAGE_SIZE);

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
        {isLoading ? (
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
                  <ImageComponent
                    src={item.cover_url}
                    alt="cover_url"
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
                          listStatusLabels[entry.list_status] ??
                          entry.list_status
                        }
                      />
                    )}

                    {item.title}
                  </span>
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1 text-[10px] windows95-text">
                    {item.score && (
                      <span className="flex flex-row items-center gap-0.5 px-1 bg-secondary text-primary font-bold">
                        <Star className="size-3 fill-white" /> {item.score}
                      </span>
                    )}
                    {item.format && (
                      <span className="px-1 bg-white windows95-border">
                        {item.format}
                      </span>
                    )}
                    {item.episodes && <span>{item.episodes} эп.</span>}
                    <span>
                      {statusLabels[item.status.toUpperCase()] ?? item.status}
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
        <AniListPaginationBar
          total={total}
          page={page}
          lastPage={lastPage}
          from={from}
          to={to}
          onPageChange={setPage}
        />
      )}
    </Modal>
  );
}
