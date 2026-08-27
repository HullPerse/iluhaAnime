import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { Star } from "lucide-react";
import { useEffect, useState } from "react";

import { SmallLoader } from "@/components/shared/loader.component";
import Modal from "@/components/shared/modal.component";
import Pagination from "@/components/shared/pagination.component";
import Tabs from "@/components/shared/tabs.component";
import ImageComponent from "@/components/ui/image.component";
import {
  listStatusLabels,
  seasonLabels,
  statusLabels,
} from "@/config/anilist.config";
import { BROWSE_PAGE_SIZE } from "@/config/pagination.config";
import { usePagination } from "@/hooks/pagination.hook";
import { getStatusColor } from "@/lib/anilist.utils";
import { useI18n } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n";
import { paginate } from "@/lib/pagination.utils";
import type { AniMedia } from "@/types/anilist";

type BrowseTab = "popular" | "trending" | "top";

const tabs: { id: BrowseTab; key: TranslationKey }[] = [
  { id: "popular", key: "anilist.browse.popular" },
  { id: "trending", key: "anilist.browse.trending" },
  { id: "top", key: "anilist.browse.top" },
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
  const { t } = useI18n();
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
    BROWSE_PAGE_SIZE,
    page,
    setPage
  );

  useEffect(() => {
    setPage(1);
  }, []);
  const paged = paginate(data, page, BROWSE_PAGE_SIZE);

  return (
    <Modal
      header={t(tabs.find((tab) => tab.id === activeTab)?.key ?? tabs[0].key)}
      onClose={onClose}
      className="w-3xl"
    >
      <Tabs
        tabs={tabs.map((tab) => ({ id: tab.id, label: t(tab.key) }))}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id)}
      />

      <div className="flex flex-1 flex-col gap-1 overflow-y-auto p-1">
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <SmallLoader size={6} className="windows95-text" />
          </div>
        ) : paged.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <span className="windows95-text">{t("common.noResults")}</span>
          </div>
        ) : (
          paged.map((item) => {
            const entry = entries.get(item.id);

            return (
              <button
                type="button"
                key={item.id}
                className="windows95-active-border bg-primary hover:bg-surface flex w-full flex-row p-2 text-left hover:cursor-pointer"
                onClick={() => onAnimeClick(item.id)}
              >
                {item.cover_url && (
                  <ImageComponent
                    src={item.cover_url}
                    alt="cover_url"
                    className="windows95-active-border h-20 w-14 shrink-0 object-cover"
                  />
                )}
                <div className="ml-2 flex min-w-0 flex-1 flex-col">
                  <span className="windows95-text flex items-center truncate font-bold">
                    {entry && (
                      <span
                        className="windows95-border mt-0.5 mr-0.5 shrink-0"
                        style={{
                          display: "inline-block",
                          width: 10,
                          height: 10,
                          backgroundColor: getStatusColor(entry.list_status),
                        }}
                        title={t(
                          (listStatusLabels[entry.list_status] ??
                            entry.list_status) as never
                        )}
                      />
                    )}

                    {item.title}
                  </span>
                  <div className="windows95-text mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs">
                    {item.score && (
                      <span className="bg-secondary text-primary flex flex-row items-center gap-0.5 px-1 font-bold">
                        <Star className="size-3 fill-white" /> {item.score}
                      </span>
                    )}
                    {item.format && (
                      <span className="windows95-border bg-white px-1">
                        {item.format}
                      </span>
                    )}
                    {item.episodes && (
                      <span>
                        {item.episodes} {t("anilist.details.epsShort")}
                      </span>
                    )}
                    <span>
                      {t(
                        (statusLabels[item.status.toUpperCase()] ??
                          item.status) as never
                      )}
                    </span>
                    {item.season && item.season_year && (
                      <span>
                        {t((seasonLabels[item.season] ?? item.season) as never)}{" "}
                        {item.season_year}
                      </span>
                    )}
                  </div>
                  {item.genres.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {item.genres.slice(0, 4).map((g) => (
                        <span
                          key={g}
                          className="windows95-border bg-white px-1 text-xs"
                        >
                          {g}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>

      {total > 0 && (
        <Pagination
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