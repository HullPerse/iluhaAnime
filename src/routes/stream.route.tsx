import { useEffect, useState } from "react";
import { reportBackgroundError } from "@hullperse/hp_utils/attempt";

import { streamApi } from "@/api/stream.api";
import { useResolvedHotkeys } from "@/hooks/hotkeys.hook";
import { useOnlineStatus } from "@/hooks/network.hook";
import { useStreamSearch } from "@/hooks/stream/catalog.hook";
import { focusMainSearch } from "@/lib/ui/focusHotkeys.utils";
import { ignoreTabCycle, stepTabId } from "@/lib/ui/tabsHotkeys.utils";
import { useCell } from "@hullperse/hp_utils/react";
import { consumeStreamDeepLink, deeplinkAtoms } from "@/store/deeplink.store";
import { settingsAtoms } from "@/store/settings.store";
import {
  applyStreamFilters,
  setStreamSort,
  streamFilters,
  streamPage,
  streamQuery,
  streamSlug,
  streamStore,
} from "@/store/stream.store";

import StreamDetail from "@/routes/components/stream/detail.stream";
import StreamFiltersModal from "@/routes/components/stream/filters.stream";
import StreamHistoryModal from "@/routes/components/stream/history.stream";
import StreamResults from "@/routes/components/stream/results.stream";
import StreamSortBar, {
  STREAM_SORT_CYCLE,
  STREAM_SORT_DEFAULT_DIR,
} from "@/routes/components/stream/sort.stream";
import { StreamDisabled } from "@/routes/components/stream/states/disabled.states";
import { StreamOffline } from "@/routes/components/stream/states/offline.states";
import StreamToolbar from "@/routes/components/stream/toolbar.stream";

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
  const [filtersOpen, setFiltersOpen] = useState<boolean>(false);
  const [historyOpen, setHistoryOpen] = useState<boolean>(false);
  const streamTarget = useCell(deeplinkAtoms.streamTarget);

  useEffect(() => {
    if (!streamTarget) return;
    streamStore.selectedSlug.set(streamTarget.slug);
    consumeStreamDeepLink();
  }, [streamTarget]);

  useResolvedHotkeys<"sort-prev" | "sort-next">(
    [
      { id: "sort-prev", chord: "Shift+BracketLeft", repeat: "once", keybindId: "tab.prev" },
      { id: "sort-next", chord: "Shift+BracketRight", repeat: "once", keybindId: "tab.next" },
    ],
    {
      ignore: (event) => ignoreTabCycle(event),
      onAction: (id) => {
        const next = stepTabId(STREAM_SORT_CYCLE, filters.sortBy, id === "sort-next" ? 1 : -1);
        if (next) setStreamSort(next, STREAM_SORT_DEFAULT_DIR[next]);
      },
    }
  );
  const openRandom = () => {
    streamApi
      .random(filters)
      .then((pick) => {
        if (pick?.slugUrl) streamStore.selectedSlug.set(pick.slugUrl);
        return null;
      })
      .catch((error: unknown) => reportBackgroundError("srcroutesstream.route", error));
  };

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
      <StreamSortBar onHistoryOpen={() => setHistoryOpen(true)} onRandom={openRandom} />
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
      {slug && <StreamDetail key={slug} slug={slug} />}
      <StreamFiltersModal
        open={filtersOpen}
        filters={filters}
        onApply={applyStreamFilters}
        onClose={() => setFiltersOpen(false)}
      />
      <StreamHistoryModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onOpen={(nextSlug) => {
          streamStore.selectedSlug.set(nextSlug);
          setHistoryOpen(false);
        }}
      />
    </div>
  );
}
