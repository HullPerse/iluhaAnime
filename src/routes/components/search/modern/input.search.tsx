import { cn } from "cn";
import { Filter, Search, X } from "lucide-react";

import { InlineAutocompleteInput } from "@/components/shared/autocomplete/input.autocomplete";
import { SmallLoader } from "@/components/shared/loader.component";
import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import Select from "@/components/ui/select.component";
import { useSearchQuery } from "@/hooks/search/query.hook";
import { useI18n } from "@/lib/locale/i18n.utils";
import { buildShadow } from "@/lib/search/wallpaper.utils";
import SearchAuthButtons from "@/routes/components/search/auth.search";
import TorrentDetailsModal from "@/routes/components/search/default/details/modal.details";
import SearchFiltersModal from "@/routes/components/search/filters.modal";
import SearchSessionModals from "@/routes/components/search/sessions.search";
import { useSettingsStore } from "@/store/settings.store";
import type { SearchFilters } from "@/types/search";

import ModernResults from "./results.modern";

function InputSearch() {
  const { t } = useI18n();
  const controller = useSearchQuery();
  const searchShadow = useSettingsStore((state) => state.searchShadow);
  const {
    field,
    handleSearch,
    resetSearch,
    isLoading,
    submittedQuery,
    source,
    searchParams,
    sourceOptions,
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
    data,
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
  } = controller;

  const docked = data !== undefined || isError;

  return (
    <section
      className={cn(
        "bg-primary windows95-active-border search-dock-motion absolute left-1/2 z-10 flex w-xl -translate-x-1/2 flex-col transition-[top,translate] duration-200 ease-out",
        docked ? "top-2 bottom-2 translate-y-0" : "top-1/2 translate-y-1/2"
      )}
      style={{ boxShadow: buildShadow(searchShadow) }}
    >
      <section className="ui-titlebar w-full justify-between">
        <div className="flex min-w-0 flex-row items-center gap-1">
          <ImageComponent
            src="/images/w98_search_directory.ico"
            alt=""
            className="size-4 shrink-0"
          />
          <span className="windows95-text line-clamp-1 font-bold text-white">{t("search.title")}</span>
        </div>
        <div className="flex shrink-0 flex-row items-center gap-0.5">
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
            layout="titlebar"
          />

          <Button
            variant="default"
            size="icon"
            className="size-4"
            title={t("search.find.reset")}
            aria-label={t("search.find.reset")}
            onClick={resetSearch}
            disabled={submittedQuery === "" && searchParams === "" && selectedTorrent === null}
          >
            <X className="size-3" />
          </Button>
        </div>
      </section>
      <section className="windows95-active-border bg-primary flex min-h-0 w-full flex-1 flex-col gap-2 p-1">
        <div className="relative flex items-center justify-center gap-1">
          <InlineAutocompleteInput
            placeholder={t("search.find.placeholder")}
            className="h-9 font-bold"
            placement={docked ? "below" : "above"}
            {...field.inputProps}
          />
        </div>
        <div className="flex w-full flex-row items-center justify-between gap-1">
          <section className="flex min-w-0 flex-row items-center gap-1">
            <Button
              variant="default"
              size="icon"
              className="relative"
              title={t("search.filters.title")}
              aria-label={t("search.filters.title")}
              onClick={() => setShowFilters(true)}
            >
              <Filter className="pointer-events-none" />
              {activeFilterCount > 0 && (
                <span className="bg-secondary absolute -top-1 -right-1 flex min-h-4 min-w-4 items-center justify-center px-0.5 text-xs leading-none text-white">
                  {activeFilterCount}
                </span>
              )}
            </Button>
            <Select
              className="h-9 max-w-30 min-w-30"
              value={source}
              onChange={(v) => changeSource(v)}
              options={sourceOptions}
              disabled={sourceOptions.length === 0}
            />
          </section>
          <section className="flex shrink-0 flex-row items-center gap-1">
            <Button
              variant="default"
              size="icon"
              title={t("search.find.submit")}
              aria-label={t("search.find.submit")}
              onClick={handleSearch}
              disabled={isLoading || sourceOptions.length === 0 || !field.deferredQuery}
            >
              {isLoading ? <SmallLoader /> : <Search className="pointer-events-none" />}
            </Button>
          </section>
        </div>
        <div
          className={cn(
            "search-dock-motion grid min-h-0 flex-1 transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
            docked ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          )}
        >
          <div className="flex min-h-0 flex-col gap-1 overflow-hidden">
            <ModernResults controller={controller} />
          </div>
        </div>
      </section>

      {showFilters && (
        <SearchFiltersModal
          open={showFilters}
          filters={filters}
          onApply={(f: SearchFilters) => setFilters(f)}
          onReset={resetFilters}
          onClose={() => setShowFilters(false)}
          sort={sortBy}
          direction={sortDirection}
          onSortChange={setSortBy}
          onDirectionChange={toggleSortDirection}
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
    </section>
  );
}

export default InputSearch;
