import { useEffect, useState } from "react";

import { useResolvedHotkeys } from "@/hooks/hotkeys.hook";
import { useOnlineStatus } from "@/hooks/network.hook";
import { useStreamSearch } from "@/hooks/stream/catalog.hook";
import { focusMainSearch } from "@/lib/hotkeys/focus.hotkeys";
import { useCell } from "@/lib/state/signal.hook";
import { settingsAtoms } from "@/store/settings.store";
import {
  applyStreamFilters,
  streamFilters,
  streamPage,
  streamQuery,
  streamSlug,
  streamStore,
} from "@/store/stream.store";

import StreamDetail from "./components/stream/detail.stream";
import StreamFiltersModal from "./components/stream/filters.stream";
import StreamResults from "./components/stream/results.stream";
import { StreamDisabled, StreamOffline } from "./components/stream/states.stream";
import StreamToolbar from "./components/stream/toolbar.stream";

export default function StreamRoute() {
  useResolvedHotkeys<"focus-main">(
    [{ id: "focus-main", chord: "ctrl+KeyK", repeat: "once", keybindId: "focus.main" }],
    {
      onAction: () => focusMainSearch(),
    }
  );
  const enabled = useCell(settingsAtoms.streamTabEnabled);
  const online = useOnlineStatus();
  const query = useCell(streamQuery);
  const page = useCell(streamPage);
  const slug = useCell(streamSlug);
  const filters = useCell(streamFilters);
  const results = useStreamSearch(query, page, filters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const lastPage = results.data?.lastPage;

  useEffect(() => {
    if (lastPage == null || lastPage < 1) return;
    if (page > lastPage) streamPage.set(lastPage);
  }, [lastPage, page]);

  if (!enabled) return <StreamDisabled />;

  return (
    <div className="flex h-full w-full flex-col gap-1">
      <StreamToolbar
        isFetching={results.isFetching}
        filters={filters}
        onRefetch={() => results.refetch()}
        onFiltersOpen={() => setFiltersOpen(true)}
      />
      {online ? (
        <StreamResults
          data={results.data}
          isPending={results.isPending}
          error={results.error}
          onOpen={(anime) => streamStore.selectedSlug.set(anime.slugUrl)}
          onRetry={() => results.refetch()}
        />
      ) : (
        <StreamOffline />
      )}
      {slug ? <StreamDetail key={slug} slug={slug} /> : null}
      <StreamFiltersModal
        open={filtersOpen}
        filters={filters}
        onApply={applyStreamFilters}
        onClose={() => setFiltersOpen(false)}
      />
    </div>
  );
}
