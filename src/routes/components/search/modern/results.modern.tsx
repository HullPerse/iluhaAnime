import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback } from "react";

import { attempt } from "@hullperse/hp_utils/attempt";
import type { Anime } from "@/types/torrent/torrent";
import SearchErrorBar from "@/routes/components/search/default/error.search";
import { SearchFilterChips } from "@/routes/components/search/default/filterChips.search";
import SearchPager from "@/routes/components/search/default/pager.search";
import SearchResultItem from "@/routes/components/search/default/result.search";
import SearchResultsSummary from "@/routes/components/search/default/summary.search";
import DidYouMeanRow from "@/routes/components/search/didyoumean.search";
import type { SearchQueryController } from "@/types/search/search";

export default function ModernResults({ controller }: { controller: SearchQueryController }) {
  const {
    isLoading,
    isFetching,
    searchParams,
    didYouMean,
    applyDidYouMean,
    filters,
    setFilters,
    isError,
    error,
    refetch,
    data,
    displayItems,
    isPagedSource,
    pageFull,
    nyaaPage,
    setNyaaPage,
    resultsPerPage,
    source,
    resultSource,
    loadingMagnet,
    copyMagnetFor,
    openMagnetFor,
    downloadMagnetFor,
    setSelectedTorrent,
  } = controller;
  const openLink = useCallback(async (item: Anime) => {
    const [, error] = await attempt(openUrl(item.link));

    if (error) console.warn("openUrl failed", error);
  }, []);
  const openDetails = useCallback(
    (item: Anime) => setSelectedTorrent({ item, source: resultSource ?? source }),
    [resultSource, source, setSelectedTorrent]
  );

  const renderResult = (item: Anime, index: number) => (
    <SearchResultItem
      key={`${item.link}-${index}`}
      item={item}
      source={resultSource ?? source}
      busy={loadingMagnet[item.link] ?? false}
      onCopyMagnet={copyMagnetFor}
      onOpenMagnet={openMagnetFor}
      onDownload={downloadMagnetFor}
      onOpenLink={openLink}
      onOpenDetails={openDetails}
    />
  );

  return (
    <>
      <SearchFilterChips query={searchParams} filters={filters} onChange={setFilters} />
      {isError && <SearchErrorBar error={error} onRetry={() => refetch()} />}
      <DidYouMeanRow
        correction={didYouMean}
        query={searchParams}
        loading={isLoading}
        resultCount={data?.length ?? 0}
        onPick={applyDidYouMean}
      />
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
        <section
          data-scroll-root
          className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-0.5"
        >
          {displayItems.map(renderResult)}
        </section>
      )}
      {isPagedSource && displayItems && displayItems.length > 0 && (
        <SearchPager
          page={nyaaPage}
          pageFull={pageFull}
          isLoading={isFetching}
          shown={displayItems.length}
          resultsPerPage={resultsPerPage}
          onPageChange={setNyaaPage}
        />
      )}
    </>
  );
}
