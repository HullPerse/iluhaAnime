import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetTransportInflight } from "@/api/transport.api";
import PlaylistLobby from "@/routes/components/lobby/playlist.lobby";
import { useCacheStore } from "@/store/cache.store";
import { useNotificationStore } from "@/store/notification.store";
import { useSessionStore } from "@/store/session.store";
import { useSettingsStore } from "@/store/settings.store";
import type { MediaIdentity, MediaPlanItem, SessionStatus, SourceInfo } from "@/types/session";

const invokeMock = vi.fn();
const openDialogMock = vi.fn(async (_options?: unknown) => null as string | null);

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `http://asset.localhost/${path}`,
  invoke: (command: string, args?: Record<string, unknown>) => invokeMock(command, args),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  confirm: async () => false,
  open: (options?: unknown) => openDialogMock(options),
  save: async () => null,
}));

const IDENTITY: MediaIdentity = {
  duration: 1440,
  sha256: "a".repeat(64),
  size: 300_000_000,
};

function item(overrides: Partial<MediaPlanItem> = {}): MediaPlanItem {
  return {
    identity: IDENTITY,
    itemId: "i1",
    order: 0,
    sources: [],
    title: "Episode 1",
    ...overrides,
  };
}

function source(overrides: Partial<SourceInfo> = {}): SourceInfo {
  return {
    kind: "hostSeeded",
    label: "Episode 1.torrent",
    sourceId: "s1",
    status: "ready",
    value: "magnet:?xt=urn:btih:abcdef01",
    ...overrides,
  };
}

const HOST_PEER = {
  anilistUserId: null,
  avatarSeed: "seed",
  buffering: false,
  connection: "direct" as const,
  displayName: "Alice",
  driftMs: 12,
  endpointId: "end-p1",
  left: false,
  peerId: "p1",
  ready: true,
  role: "host" as const,
  rttMs: 45,
};

function hostStatus(overrides: Partial<SessionStatus> = {}): SessionStatus {
  return {
    addrs: [],
    pinned: null,
    reactions: [],
    chat: [],
    hostOnline: true,
    lobbyRole: "host",
    missing: {},
    paths: {},
    peers: [HOST_PEER],
    plan: [item()],
    ready: { allReady: true, peers: [{ peerId: "p1", ready: true }] },
    role: "host",
    sessionId: "a1b2c3d4e5f60718",
    yourPeerId: null,
    ticket: null,
    waiting: null,
    ...overrides,
  };
}

function guestStatus(overrides: Partial<SessionStatus> = {}): SessionStatus {
  return {
    addrs: [],
    pinned: null,
    reactions: [],
    chat: [],
    hostOnline: true,
    lobbyRole: "viewer",
    missing: {},
    paths: {},
    peers: [HOST_PEER],
    plan: [item()],
    ready: { allReady: true, peers: [{ peerId: "p1", ready: true }] },
    role: "guest",
    sessionId: "a1b2c3d4e5f60718",
    yourPeerId: null,
    ticket: null,
    waiting: null,
    ...overrides,
  };
}

let client: QueryClient;

function renderWithClient(element: ReactElement) {
  return render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}

function mockInvoke(handler: (command: string) => unknown) {
  invokeMock.mockImplementation(async (command: string) => handler(command));
}

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
  useSessionStore.setState({
    chatDraft: "",
    displayName: "",
    joinInput: "",
    pendingChats: [],
  });
  useCacheStore.setState({ lastSaveDir: "" });
  useNotificationStore.setState({ dismissed: [], items: [], unreadCount: 0 });
  invokeMock.mockReset();
  openDialogMock.mockReset();
  openDialogMock.mockResolvedValue(null);
  resetTransportInflight();
  mockInvoke(() => hostStatus());
  client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
});

afterEach(() => {
  cleanup();
});

describe("PlaylistLobby host", () => {
  it("shows the host empty state and hides the guest copy controls", () => {
    renderWithClient(<PlaylistLobby status={hostStatus({ plan: [] })} />);

    expect(screen.getByText("Add a file to build the plan.")).toBeTruthy();
    expect(screen.queryByText("Use my file")).toBeNull();
    expect(screen.queryByText("Pick folder")).toBeNull();
  });

  it("starts a plan item when the host clicks Play", async () => {
    const user = userEvent.setup();
    renderWithClient(<PlaylistLobby status={hostStatus()} />);

    expect(screen.getByText("Ready 1/1")).toBeTruthy();
    const play = screen.getByRole("button", { name: "Play" });
    expect((play as HTMLButtonElement).disabled).toBe(false);

    await user.click(play);
    await waitFor(() => {
      expect(
        invokeMock.mock.calls.some(
          ([command, args]) =>
            command === "session_start_item" &&
            (args as { itemId: string }).itemId === "i1"
        )
      ).toBe(true);
    });
  });

  it("holds an item and names the missing peers", () => {
    renderWithClient(
      <PlaylistLobby
        status={hostStatus({
          missing: { i1: ["p2"] },
          peers: [
            HOST_PEER,
            { ...HOST_PEER, displayName: "Kira", peerId: "p2", ready: false },
          ],
          ready: {
            allReady: false,
            peers: [
              { peerId: "p1", ready: true },
              { peerId: "p2", ready: false },
            ],
          },
          waiting: { itemId: "i1", peerIds: ["p2"] },
        })}
      />
    );

    expect(screen.getByText("Ready 1/2")).toBeTruthy();
    expect(screen.getAllByText("Waiting for Kira").length).toBeGreaterThan(0);
    expect(
      (screen.getByRole("button", { name: "Play" }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
  });

  it("shows the item duration and size", () => {
    renderWithClient(<PlaylistLobby status={hostStatus()} />);

    expect(screen.getByText("24:00 · 286.1 MB")).toBeTruthy();
  });

  it("removes a plan item through the playlist command", async () => {
    const user = userEvent.setup();
    renderWithClient(<PlaylistLobby status={hostStatus()} />);

    await user.click(screen.getByRole("button", { name: "Remove item" }));

    await waitFor(() => {
      expect(
        invokeMock.mock.calls.some(
          ([command, args]) =>
            command === "session_set_playlist" &&
            JSON.stringify(args) === JSON.stringify({ items: [], paths: {} })
        )
      ).toBe(true);
    });
  });

  it("detects the kind of an added source and sends it", async () => {
    const user = userEvent.setup();
    renderWithClient(<PlaylistLobby status={hostStatus()} />);

    await user.type(
      screen.getByPlaceholderText("Path, magnet, or link"),
      "magnet:?xt=urn:btih:ABC"
    );
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(
        invokeMock.mock.calls.some(([command, args]) => {
          if (command !== "session_add_source") return false;
          const parsed = structuredClone(args) as {
            itemId: string;
            source: SourceInfo;
          };
          return (
            parsed.itemId === "i1" &&
            parsed.source.kind === "magnet" &&
            parsed.source.value === "magnet:?xt=urn:btih:ABC"
          );
        })
      ).toBe(true);
    });
  });

  it("detects torrent and deep-link sources", async () => {
    const user = userEvent.setup();
    mockInvoke((command) => {
      if (command === "session_add_source") return undefined;
      return hostStatus();
    });
    renderWithClient(<PlaylistLobby status={hostStatus()} />);

    await user.type(
      screen.getByPlaceholderText("Path, magnet, or link"),
      "D:/anime/x.torrent"
    );
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(
        invokeMock.mock.calls.some(
          ([command, args]) =>
            command === "session_add_source" &&
            (args as { source: SourceInfo }).source.kind === "torrent"
        )
      ).toBe(true);
    });

    const input = screen.getByPlaceholderText("Path, magnet, or link");
    await user.clear(input);
    await user.type(input, `iluhaanime://torrent/${"a".repeat(40)}`);
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(
        invokeMock.mock.calls.some(
          ([command, args]) =>
            command === "session_add_source" &&
            (args as { source: SourceInfo }).source.kind === "deepLink"
        )
      ).toBe(true);
    });
  });

  it("removes a source from an item", async () => {
    const user = userEvent.setup();
    renderWithClient(
      <PlaylistLobby status={hostStatus({ plan: [item({ sources: [source()] })] })} />
    );

    await user.click(screen.getByRole("button", { name: "Remove source" }));

    await waitFor(() => {
      expect(
        invokeMock.mock.calls.some(
          ([command, args]) =>
            command === "session_remove_source" &&
            JSON.stringify(args) === JSON.stringify({ itemId: "i1", sourceId: "s1" })
        )
      ).toBe(true);
    });
  });

  it("adds a plan item with the host-local path", async () => {
    const user = userEvent.setup();
    mockInvoke((command) => {
      if (command === "media_identity") return IDENTITY;
      return hostStatus();
    });
    renderWithClient(<PlaylistLobby status={hostStatus()} />);

    await user.type(
      screen.getByPlaceholderText("Path to a video file"),
      "D:/anime/ep2.mkv"
    );
    await user.click(screen.getByRole("button", { name: "Add item" }));

    await waitFor(() => {
      expect(
        invokeMock.mock.calls.some(([command, args]) => {
          if (command !== "session_set_playlist") return false;
          const parsed = args as {
            items: MediaPlanItem[];
            paths: Record<string, string>;
          };
          return (
            parsed.items.length === 2 &&
            Object.values(parsed.paths).includes("D:/anime/ep2.mkv")
          );
        })
      ).toBe(true);
    });
  });
});

describe("PlaylistLobby guest", () => {
  it("shows the guest empty state and hides the host add controls", () => {
    renderWithClient(<PlaylistLobby status={guestStatus({ plan: [] })} />);

    expect(screen.getByText("The host has not added anything yet.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add item" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Create torrent" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Start" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Play" })).toBeNull();
  });

  it("marks a plan item the guest has not matched as missing", () => {
    renderWithClient(<PlaylistLobby status={guestStatus()} />);

    expect(screen.getByText("Missing")).toBeTruthy();
  });

  it("reports readiness on mount with each item missing", async () => {
    renderWithClient(<PlaylistLobby status={guestStatus()} />);

    await waitFor(() => {
      expect(
        invokeMock.mock.calls.some(
          ([command, args]) =>
            command === "session_set_ready" &&
            JSON.stringify(args) ===
              JSON.stringify({
                ready: true,
                items: [{ itemId: "i1", present: false, verified: false }],
              })
        )
      ).toBe(true);
    });
  });

  it("marks an exact local copy as matched and re-reports readiness", async () => {
    const user = userEvent.setup();
    mockInvoke((command) => {
      if (command === "media_identity") return IDENTITY;
      return guestStatus();
    });
    renderWithClient(<PlaylistLobby status={guestStatus()} />);

    await user.type(screen.getByPlaceholderText("Path to your copy"), "D:/anime/ep1.mkv");
    await user.click(screen.getByRole("button", { name: "Use my file" }));

    expect(await screen.findByText("Matched")).toBeTruthy();
    await waitFor(() => {
      expect(
        invokeMock.mock.calls.some(
          ([command, args]) =>
            command === "session_set_ready" &&
            JSON.stringify(args).includes('"verified":true')
        )
      ).toBe(true);
    });
  });

  it("marks a different local copy as a different file", async () => {
    const user = userEvent.setup();
    mockInvoke((command) => {
      if (command === "media_identity")
        return { duration: 1200, sha256: "b".repeat(64), size: 1 };
      return guestStatus();
    });
    renderWithClient(<PlaylistLobby status={guestStatus()} />);

    await user.type(screen.getByPlaceholderText("Path to your copy"), "D:/anime/other.mkv");
    await user.click(screen.getByRole("button", { name: "Use my file" }));

    expect(await screen.findByText("Different file")).toBeTruthy();
  });

  it("shows a delta table when a compatible copy differs", async () => {
    const user = userEvent.setup();
    mockInvoke((command) => {
      if (command === "media_identity")
        return { duration: 1440.5, sha256: "b".repeat(64), size: 299_000_000 };
      return guestStatus();
    });
    renderWithClient(<PlaylistLobby status={guestStatus()} />);

    await user.type(screen.getByPlaceholderText("Path to your copy"), "D:/anime/ep1.mkv");
    await user.click(screen.getByRole("button", { name: "Use my file" }));

    expect(await screen.findByText("Compatible")).toBeTruthy();
    expect(screen.getByText("Size")).toBeTruthy();
    expect(screen.getByText("Duration")).toBeTruthy();
  });

  it("marks a copy with different video params as risky", async () => {
    const user = userEvent.setup();
    mockInvoke((command) => {
      if (command === "media_identity")
        return {
          duration: 1440,
          sha256: "b".repeat(64),
          size: 300_000_000,
          video: { bitrate: 1, codec: "h264", fps: 24, height: 1080, width: 1920 },
        };
      return guestStatus();
    });
    renderWithClient(<PlaylistLobby status={guestStatus()} />);

    await user.type(screen.getByPlaceholderText("Path to your copy"), "D:/anime/ep1.mkv");
    await user.click(screen.getByRole("button", { name: "Use my file" }));

    expect(await screen.findByText("Risky match")).toBeTruthy();
  });

  it("warns when a picked folder has no matching copy", async () => {
    const user = userEvent.setup();
    mockInvoke((command) => {
      if (command === "session_match_folder") return null;
      return guestStatus();
    });
    openDialogMock.mockResolvedValue("D:/anime");
    renderWithClient(<PlaylistLobby status={guestStatus()} />);

    await user.click(screen.getByRole("button", { name: "Pick folder" }));

    await waitFor(() => {
      expect(
        useNotificationStore.getState().items.some(
          (entry) => entry.message === "No matching file in that folder."
        )
      ).toBe(true);
    });
  });

  it("downloads the host torrent into the cached save folder", async () => {
    const user = userEvent.setup();
    useCacheStore.setState({ lastSaveDir: "D:/downloads" });
    mockInvoke((command) => {
      if (command === "get_torrent_info")
        return {
          conflicting_files: [],
          files: [
            {
              completed: false,
              exists: false,
              index: 0,
              name: "Episode 1.mkv",
              priority: "normal",
              progress_bytes: 0,
              selected: true,
              size: 300_000_000,
            },
          ],
          has_common_folder: false,
          id: 0,
          name: "Episode 1.mkv",
        };
      if (command === "start_torrent_download") return 1;
      return guestStatus({ plan: [item({ sources: [source()] })] });
    });
    renderWithClient(
      <PlaylistLobby status={guestStatus({ plan: [item({ sources: [source()] })] })} />
    );

    await user.click(screen.getByRole("button", { name: "Download from host" }));

    await waitFor(() => {
      expect(
        invokeMock.mock.calls.some(([command, args]) => {
          if (command !== "start_torrent_download") return false;
          const parsed = args as { magnet: string; saveDir: string };
          return (
            parsed.magnet === "magnet:?xt=urn:btih:abcdef01" &&
            parsed.saveDir === "D:/downloads"
          );
        })
      ).toBe(true);
    });
    // The cached folder skips the picker entirely.
    expect(openDialogMock).not.toHaveBeenCalled();
    expect(
      useNotificationStore.getState().items.some(
        (entry) => entry.title === "Download started"
      )
    ).toBe(true);
  });

  it("does not offer Play to a viewer", () => {
    renderWithClient(<PlaylistLobby status={guestStatus()} />);

    expect(screen.queryByRole("button", { name: "Play" })).toBeNull();
  });

  it("starts an item when a moderator clicks Play", async () => {
    const user = userEvent.setup();
    renderWithClient(<PlaylistLobby status={guestStatus({ lobbyRole: "moderator" })} />);

    await user.click(screen.getByRole("button", { name: "Play" }));

    await waitFor(() => {
      expect(
        invokeMock.mock.calls.some(
          ([command, args]) =>
            command === "session_start_item" &&
            JSON.stringify(args) === JSON.stringify({ itemId: "i1" })
        )
      ).toBe(true);
    });
  });
});
