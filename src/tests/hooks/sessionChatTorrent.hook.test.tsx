import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetTransportInflight } from "@/api/transport.api";
import { LOBBY_CHAT_ATTACHMENT_MAX_BYTES } from "@/config/lobby/common.config";
import { useChatTorrentDownload } from "@/hooks/session/chat.torrent.hook";
import { useCacheStore } from "@/store/cache.store";
import { useNotificationStore } from "@/store/notification.store";
import { useSessionStore } from "@/store/session.store";
import { useSettingsStore } from "@/store/settings.store";

const invokeMock = vi.hoisted(() => vi.fn());
const openDialogMock = vi.hoisted(() =>
  vi.fn(async (_options?: unknown) => null as string | null)
);

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `http://asset.localhost/${path}`,
  invoke: (command: string, args?: Record<string, unknown>) => invokeMock(command, args),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  confirm: async () => false,
  open: (options?: unknown) => openDialogMock(options),
  save: async () => null,
}));

const MAGNET = "magnet:?xt=urn:btih:abcdef0123456789abcdef0123456789abcdef01";
const DEEP_LINK = `iluhaanime://torrent/${"ab".repeat(20)}`;
const DEEP_LINK_MAGNET = `magnet:?xt=urn:btih:${"ab".repeat(20)}`;

function torrentFile(index: number, name: string, size: number) {
  return {
    completed: true,
    exists: true,
    index,
    name,
    priority: "normal" as const,
    progress_bytes: size,
    selected: true,
    size,
  };
}

function info(files: ReturnType<typeof torrentFile>[]) {
  return {
    conflicting_files: [],
    files,
    has_common_folder: false,
    id: 3,
    name: "Show",
  };
}

function callsTo(command: string) {
  return invokeMock.mock.calls.filter((call) => call[0] === command);
}

let client: QueryClient;

function renderChatTorrent() {
  return renderHook(() => useChatTorrentDownload(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
  useSessionStore.setState({ chatDraft: "", displayName: "Alice" });
  useCacheStore.setState({ lastSaveDir: "D:/dl" });
  useNotificationStore.setState({ dismissed: [], items: [], unreadCount: 0 });
  invokeMock.mockReset();
  openDialogMock.mockReset();
  openDialogMock.mockResolvedValue(null);
  resetTransportInflight();
  invokeMock.mockImplementation(async (command: string) => {
    if (command === "get_torrent_info" || command === "get_torrent_info_from_file") {
      return info([torrentFile(0, "Show/Ep01.mkv", 100)]);
    }
    if (command === "start_torrent_download" || command === "start_torrent_download_from_file") {
      return 1;
    }
    if (command === "session_chat_attachment") return { bytes: [1, 2], name: "x.torrent" };
    if (command === "read_file_bytes") return [9, 9, 9];
    return undefined;
  });
  client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useChatTorrentDownload", () => {
  it("downloads a single-file magnet right away", async () => {
    const { result } = renderChatTorrent();

    act(() => result.current.openLink(MAGNET));

    await waitFor(() => expect(callsTo("start_torrent_download")).toHaveLength(1));
    expect(callsTo("get_torrent_info")[0][1]).toEqual({ magnet: MAGNET, saveDir: "D:/dl" });
    expect(callsTo("start_torrent_download")[0][1]).toEqual({
      magnet: MAGNET,
      onlyFiles: null,
      saveDir: "D:/dl",
      sequential: false,
      subFolder: null,
    });
    expect(result.current.picker).toBeNull();
    await waitFor(() =>
      expect(
        useNotificationStore
          .getState()
          .items.some((item) => item.title === "Download started")
      ).toBe(true)
    );
  });

  it("opens the file-selection modal for a multi-file magnet", async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "get_torrent_info") {
        return info([
          torrentFile(0, "Show/Ep01.mkv", 100),
          torrentFile(1, "Show/Ep02.mkv", 101),
        ]);
      }
      return undefined;
    });
    const { result } = renderChatTorrent();

    act(() => result.current.openLink(MAGNET));
    await waitFor(() => expect(result.current.picker).not.toBeNull());
    expect(callsTo("start_torrent_download")).toHaveLength(0);

    await act(() => result.current.confirmPicker([0], "D:/dl", undefined));
    expect(result.current.picker).toBeNull();
    expect(callsTo("start_torrent_download")[0][1]).toEqual({
      magnet: MAGNET,
      onlyFiles: [0],
      saveDir: "D:/dl",
      sequential: false,
      subFolder: null,
    });
  });

  it("selecting every file starts an unrestricted download", async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "get_torrent_info") {
        return info([
          torrentFile(0, "Show/Ep01.mkv", 100),
          torrentFile(1, "Show/Ep02.mkv", 101),
        ]);
      }
      return undefined;
    });
    const { result } = renderChatTorrent();

    act(() => result.current.openLink(MAGNET));
    await waitFor(() => expect(result.current.picker).not.toBeNull());

    await act(() => result.current.confirmPicker([0, 1], "D:/dl", "Show"));
    expect(callsTo("start_torrent_download")[0][1]).toMatchObject({
      onlyFiles: null,
      subFolder: "Show",
    });
  });

  it("turns an iluhaanime torrent deep link into a bare info-hash magnet", async () => {
    const { result } = renderChatTorrent();

    act(() => result.current.openLink(DEEP_LINK));

    await waitFor(() => expect(callsTo("get_torrent_info")).toHaveLength(1));
    expect(callsTo("get_torrent_info")[0][1]).toEqual({
      magnet: DEEP_LINK_MAGNET,
      saveDir: "D:/dl",
    });
  });

  it("ignores links that are not torrents", async () => {
    const { result } = renderChatTorrent();

    act(() => result.current.openLink("https://example.com/watch"));
    act(() => result.current.openLink("hello"));

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(callsTo("get_torrent_info")).toHaveLength(0);
    expect(callsTo("start_torrent_download")).toHaveLength(0);
  });

  it("fetches an attachment and downloads its bytes", async () => {
    const { result } = renderChatTorrent();

    act(() => result.current.openAttachment("m7"));

    await waitFor(() => expect(callsTo("start_torrent_download_from_file")).toHaveLength(1));
    expect(callsTo("session_chat_attachment")[0][1]).toEqual({ messageId: "m7" });
    expect(callsTo("get_torrent_info_from_file")[0][1]).toEqual({
      fileBytes: [1, 2],
      saveDir: "D:/dl",
    });
    expect(callsTo("start_torrent_download_from_file")[0][1]).toEqual({
      fileBytes: [1, 2],
      onlyFiles: null,
      saveDir: "D:/dl",
      sequential: false,
      subFolder: null,
    });
    expect(result.current.fetching).toBeNull();
    expect(result.current.failed).toBeNull();
  });

  it("stops without downloading when the attachment is gone", async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "session_chat_attachment") {
        throw new Error("attachment is no longer available");
      }
      return undefined;
    });
    const { result } = renderChatTorrent();

    act(() => result.current.openAttachment("m7"));

    await waitFor(() =>
      expect(
        useNotificationStore
          .getState()
          .items.some((item) => item.message === "This attachment is no longer available.")
      ).toBe(true)
    );
    expect(result.current.fetching).toBeNull();
    expect(result.current.failed).toBe("m7");
    expect(callsTo("start_torrent_download_from_file")).toHaveLength(0);
  });

  it("attaches a local .torrent as an empty chat line with the bytes", async () => {
    openDialogMock.mockResolvedValue("D:/t/Episode 1.torrent");
    const { result } = renderChatTorrent();

    act(() => result.current.attachFromFile());

    await waitFor(() => expect(callsTo("session_chat")).toHaveLength(1));
    const args = callsTo("session_chat")[0][1] as Record<string, unknown>;
    expect(args.text).toBe("");
    expect(args.fileName).toBe("Episode 1.torrent");
    expect(args.fileBytes).toEqual([9, 9, 9]);
    expect(typeof args.id).toBe("string");
  });

  it("refuses a .torrent larger than the frame cap", async () => {
    openDialogMock.mockResolvedValue("D:/t/big.torrent");
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "read_file_bytes") {
        return Array.from(
          { length: LOBBY_CHAT_ATTACHMENT_MAX_BYTES + 1 },
          () => 1
        );
      }
      return undefined;
    });
    const { result } = renderChatTorrent();

    act(() => result.current.attachFromFile());

    await waitFor(() =>
      expect(
        useNotificationStore
          .getState()
          .items.some((item) => item.message === "The .torrent is too large (max 180 KB).")
      ).toBe(true)
    );
    expect(callsTo("session_chat")).toHaveLength(0);
  });

  it("drops a picked file that is not a .torrent", async () => {
    openDialogMock.mockResolvedValue("D:/t/notes.txt");
    const { result } = renderChatTorrent();

    act(() => result.current.attachFromFile());

    await waitFor(() =>
      expect(
        useNotificationStore
          .getState()
          .items.some((item) => item.message === "Only .torrent files can be attached.")
      ).toBe(true)
    );
    expect(callsTo("read_file_bytes")).toHaveLength(0);
    expect(callsTo("session_chat")).toHaveLength(0);
  });
});
