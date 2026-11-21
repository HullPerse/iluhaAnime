import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render } from "@testing-library/react";
import { Profiler } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TorrentInfo } from "@/types/torrent/torrent";

const state = vi.hoisted(() => ({
  items: [] as TorrentInfo[],
  actionCalls: [] as number[],
  updateCommits: 0,
}));

const actionStubs = vi.hoisted(() => ({
  onPause: () => undefined,
  onResume: () => undefined,
  onSeedChange: () => undefined,
  onRemove: () => undefined,
  onUpdateFiles: () => undefined,
  onFilePriorityChange: () => undefined,
  onApplyQueue: () => undefined,
  onSetSequential: () => undefined,
  onRecreate: () => undefined,
  onRedownload: () => undefined,
  onRecheck: () => undefined,
  onRecheckPaused: () => undefined,
  onUpdateRequest: () => undefined,
}));

vi.mock("@/hooks/torrent/actions.hook", () => ({
  useTorrentItemActions: (item: TorrentInfo) => {
    state.actionCalls.push(item.id);
    return actionStubs;
  },
}));

vi.mock("@/routes/components/torrent/item.torrent", () => ({
  default: () => null,
}));

vi.mock("@/hooks/torrent/queries.hook", () => ({
  TORRENTS_QUERY_KEY: ["torrents"],
  useTorrents: () => ({ data: state.items, isLoading: false }),
  useTorrentFilesMap: () => ({
    files: {},
    errors: {},
    requestRefresh: () => undefined,
  }),
  useTorrentListenPort: () => ({ data: null }),
  useDhtStats: () => ({ data: null }),
}));

vi.mock("@/hooks/torrent/bulk.hook", () => ({
  useTorrentBulk: () => ({
    bulkBusy: false,
    recreateTargets: [],
    setRecreateTargets: () => undefined,
    recreateTorrents: async () => undefined,
    runBulk: async () => undefined,
  }),
  useTorrentBulkDialogs: () => ({
    removeTargets: null,
    requestRemove: () => undefined,
    confirmRemove: () => undefined,
    closeRemove: () => undefined,
    trackersOpen: false,
    openTrackers: () => undefined,
    closeTrackers: () => undefined,
    applyTrackers: () => undefined,
    limitsOpen: false,
    openLimits: () => undefined,
    closeLimits: () => undefined,
    applyLimits: () => undefined,
  }),
}));

vi.mock("@/hooks/hostStats.hook", () => ({
  useHostStats: () => null,
}));

vi.mock("@/hooks/tauriEvent.hook", () => ({
  useTauriEvent: () => undefined,
}));

vi.mock("@/hooks/watcher/changes.watcher.hook", () => ({
  useFolderContentChanged: () => undefined,
}));

vi.mock("@/components/shared/hostStats/bars.hostStats", () => ({
  HostStatsBars: () => null,
}));

vi.mock("@/routes/components/torrent/graph.torrent", () => ({
  SpeedGraph: () => null,
}));

vi.mock("@/routes/components/torrent/speed.torrent", () => ({
  default: () => null,
}));

vi.mock("@/routes/components/torrent/filter.torrent", () => ({
  default: () => null,
}));

vi.mock("@/routes/__root.defs", () => ({
  torrentRoute: {
    useSearch: () => ({ q: "", sort: "name", dir: "asc", page: 1, lifecycle: "all" }),
    useNavigate: () => () => undefined,
  },
}));

import TorrentRoute from "@/routes/torrent.route";
import { patchSettings } from "@/store/settings.store";

const torrent = (id: number, overrides: Partial<TorrentInfo> = {}): TorrentInfo => ({
  id,
  name: `torrent-${id}`,
  info_hash: `hash-${id}`,
  total_bytes: 100,
  progress_bytes: 0,
  uploaded_bytes: 0,
  share_ratio: 0,
  download_speed: 0,
  upload_speed: 0,
  peers_connected: 0,
  progress: 0,
  state: "paused",
  eta_secs: 0,
  finished: false,
  error: null,
  save_dir: "D:/media",
  sequential_download: false,
  sequential_file: null,
  download_order: [],
  missing_files: false,
  external_changes: false,
  external_changed_files: [],
  ...overrides,
});

const A = torrent(1);
const B = torrent(2);
const originalScrollTo = HTMLElement.prototype.scrollTo;

beforeEach(() => {
  state.items = [A, B];
  state.actionCalls = [];
  state.updateCommits = 0;
  patchSettings({ language: "ru" });
  HTMLElement.prototype.scrollTo = () => undefined;
});

afterEach(() => {
  if (originalScrollTo) HTMLElement.prototype.scrollTo = originalScrollTo;
  else delete (HTMLElement.prototype as { scrollTo?: () => void }).scrollTo;
  cleanup();
});

describe("torrent route row memoization", () => {
  it("does not re-render an unchanged row when another torrent updates", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const tree = () => (
      <QueryClientProvider client={client}>
        <Profiler
          id="torrent-route"
          onRender={(_id, phase) => {
            if (phase !== "mount") state.updateCommits += 1;
          }}
        >
          <TorrentRoute />
        </Profiler>
      </QueryClientProvider>
    );

    const view = render(tree());
    await act(async () => {});

    expect(state.actionCalls).toContain(A.id);
    expect(state.actionCalls).toContain(B.id);
    state.actionCalls = [];

    state.items = [torrent(A.id, { download_speed: 10 }), B];
    view.rerender(tree());

    console.warn(
      `[profiler] torrent route: changed row renders=${state.actionCalls.filter((id) => id === A.id).length}, unchanged row renders=${state.actionCalls.filter((id) => id === B.id).length}, update commits=${state.updateCommits}`
    );

    expect(state.actionCalls).toContain(A.id);
    expect(state.actionCalls).not.toContain(B.id);
    expect(state.updateCommits).toBeGreaterThan(0);
  });
});
