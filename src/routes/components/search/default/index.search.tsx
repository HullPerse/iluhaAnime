import { openUrl } from "@tauri-apps/plugin-opener";
import { Search } from "lucide-react";

import { InlineAutocompleteInput } from "@/components/shared/autocomplete/input.autocomplete";
import { SmallLoader } from "@/components/shared/loader.component";
import { Button } from "@/components/ui/button.component";
import Select from "@/components/ui/select.component";
import { useSearchQuery } from "@/hooks/search/query.hook";
import { useI18n } from "@/lib/locale/i18n.utils";
import SearchAuthButtons from "@/routes/components/search/auth.search";
import TorrentDetailsModal from "@/routes/components/search/default/details/modal.details";
import SearchErrorBar from "@/routes/components/search/default/error.search";
import { SearchFilterChips } from "@/routes/components/search/default/filterChips.search";
import SearchFiltersBar from "@/routes/components/search/default/filters/bar.filters";
import SearchPager from "@/routes/components/search/default/pager.search";
import SearchResultItem from "@/routes/components/search/default/result.search";
import SearchResultsSummary from "@/routes/components/search/default/summary.search";
import DidYouMeanRow from "@/routes/components/search/didyoumean.search";
import SearchFiltersModal from "@/routes/components/search/filters.modal";
import SearchSessionModals from "@/routes/components/search/sessions.search";
import type { SearchFilters } from "@/types/search";

function SearchDefault() {
  const { t } = useI18n();
  const {
    source,
    sourceOptions,
    isLoading,
    searchParams,
    submittedQuery,
    didYouMean,
    applyDidYouMean,
    field,
    handleSearch,
    changeSource,
    sortBy,
    sortDirection,
    setSortBy,
    toggleSortDirection,
    filters,
    setFilters,
    resetFilters,
    activeFilterCount,
    showFilters,
    setShowFilters,
    isError,
    error,
    refetch,
    data,
    displayItems,
    isPagedSource,
    nyaaPage,
    setNyaaPage,
    resultsPerPage,
    rutrackerAuth,
    nekobtAuth,
    eraiAuth,
    showLogin,
    showEraiLogin,
    showApiModal,
    setShowLogin,
    setShowEraiLogin,
    setShowApiModal,
    handleLogout,
    handleNekoBtLogout,
    handleEraiLogout,
    onAuthenticated,
    magnets,
    loadingMagnet,
    copyMagnetFor,
    openMagnetFor,
    downloadMagnetFor,
    selectedTorrent,
    setSelectedTorrent,
  } = useSearchQuery();

  return (
    <div className="flex h-full w-full flex-col gap-1">
      <section className="ui-toolbar ui-panel w-full flex-row">
        <div className="relative flex flex-1 items-center justify-center gap-1">
          <InlineAutocompleteInput
            placeholder={t("search.find.placeholder")}
            className="h-9 font-bold"
            {...field.inputProps}
            highlightRanges={
              didYouMean && searchParams === submittedQuery
                ? [{ start: 0, end: searchParams.length }]
                : undefined
            }
          />
        </div>
        <Button
          variant="default"
          size="icon"
          onClick={handleSearch}
          disabled={isLoading || sourceOptions.length === 0}
        >
          {isLoading ? <SmallLoader /> : <Search className="pointer-events-none" />}
        </Button>
        <span className="ui-toolbar-separator" aria-hidden />
        <Select
          className="h-9 max-w-30 min-w-30"
          value={source}
          onChange={(v) => changeSource(v)}
          options={sourceOptions}
          disabled={sourceOptions.length === 0}
        />
        <SearchAuthButtons
          source={source}
          rutrackerAuth={rutrackerAuth}
          nekobtAuth={nekobtAuth}
          eraiAuth={eraiAuth}
          onLoginOpen={() => setShowLogin(true)}
          onApiModalOpen={() => setShowApiModal(true)}
          onEraiLoginOpen={() => setShowEraiLogin(true)}
          onLogout={handleLogout}
          onNekoBtLogout={handleNekoBtLogout}
          onEraiLogout={handleEraiLogout}
        />
      </section>

      <SearchFiltersBar
        sort={sortBy}
        direction={sortDirection}
        activeFilterCount={activeFilterCount}
        onSortChange={setSortBy}
        onDirectionChange={toggleSortDirection}
        onOpenFilters={() => setShowFilters(true)}
      />
      <SearchFilterChips query={searchParams} filters={filters} onChange={setFilters} />

      {showFilters && (
        <SearchFiltersModal
          open={showFilters}
          filters={filters}
          onApply={(f: SearchFilters) => setFilters(f)}
          onReset={resetFilters}
          onClose={() => setShowFilters(false)}
        />
      )}

      {isError && <SearchErrorBar error={error} onRetry={() => refetch()} />}
      <DidYouMeanRow
        correction={didYouMean}
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
        <section className="flex min-h-0 w-full flex-1 flex-col gap-1 overflow-y-auto p-0.5">
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
                } catch (error) {
                  console.warn("openUrl failed", error);
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

      <SearchSessionModals
        showLogin={showLogin}
        showEraiLogin={showEraiLogin}
        showApiModal={showApiModal}
        setShowLogin={setShowLogin}
        setShowEraiLogin={setShowEraiLogin}
        setShowApiModal={setShowApiModal}
        onAuthenticated={onAuthenticated}
      />
      {selectedTorrent && (
        <TorrentDetailsModal
          item={selectedTorrent.item}
          source={selectedTorrent.source}
          magnets={magnets}
          loadingMagnet={loadingMagnet}
          onClose={() => setSelectedTorrent(null)}
          onCopyMagnet={(item) => copyMagnetFor(item)}
          onOpenMagnet={(item) => openMagnetFor(item)}
          onDownload={async (item) => {
            setSelectedTorrent(null);
            await downloadMagnetFor(item);
          }}
        />
      )}
    </div>
  );
}

export default SearchDefault;
