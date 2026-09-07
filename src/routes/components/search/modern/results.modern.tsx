import { openUrl } from "@tauri-apps/plugin-opener";

import SearchErrorBar from "@/routes/components/search/default/error.search";
import { SearchFilterChips } from "@/routes/components/search/default/filterChips.search";
import SearchPager from "@/routes/components/search/default/pager.search";
import SearchResultItem from "@/routes/components/search/default/result.search";
import SearchResultsSummary from "@/routes/components/search/default/summary.search";
import type { SearchQueryController } from "@/types/search";

export default function ModernResults({ controller }: { controller: SearchQueryController }) {
  const {
    isLoading,
    searchParams,
    filters,
    setFilters,
    isError,
    error,
    refetch,
    data,
    displayItems,
    isPagedSource,
    nyaaPage,
    setNyaaPage,
    resultsPerPage,
    source,
    loadingMagnet,
    copyMagnetFor,
    openMagnetFor,
    downloadMagnetFor,
    setSelectedTorrent,
  } = controller;

  return (
    <>
      <SearchFilterChips query={searchParams} filters={filters} onChange={setFilters} />
      {isError && <SearchErrorBar error={error} onRetry={() => refetch()} />}
      {data && data.length > 0 && (
        <SearchResultsSummary
          data={data}
          shown={displayItems?.length ?? 0}
          isPagedSource={isPagedSource}
          page={nyaaPage}
          resultsPerPage={resultsPerPage}
        />
      )}
      {displayItems && (
        <section className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-0.5">
          {displayItems.map((item, index) => (
            <SearchResultItem
              key={`${item.link}-${index}`}
              item={item}
              source={source}
              loadingMagnet={loadingMagnet}
              onCopyMagnet={(i) => copyMagnetFor(i)}
              onOpenMagnet={(i) => openMagnetFor(i)}
              onDownload={(i) => downloadMagnetFor(i)}
              onOpenLink={async (i) => {
                try {
                  await openUrl(i.link);
                } catch (openError) {
                  console.warn("openUrl failed", openError);
                }
              }}
              onOpenDetails={(i) => setSelectedTorrent({ item: i, source })}
            />
          ))}
        </section>
      )}
      {isPagedSource && displayItems && displayItems.length > 0 && (
        <SearchPager
          page={nyaaPage}
          pageFull={(data?.length ?? 0) >= resultsPerPage}
          isLoading={isLoading}
          onPageChange={setNyaaPage}
        />
      )}
    </>
  );
}
