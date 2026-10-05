import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetTransportInflight } from "@/api/transport.api";
import RoomLobby from "@/routes/components/lobby/room.lobby";
import LobbyRoute from "@/routes/lobby.route";
import { useCacheStore } from "@/store/cache.store";
import { useSessionStore } from "@/store/session.store";
import { useSettingsStore } from "@/store/settings.store";
import type { SessionStatus } from "@/types/session";

const invokeMock = vi.fn();
const writeTextMock = vi.fn(async (_value: string) => undefined);
const openDialogMock = vi.fn(async (_options?: unknown) => null as string | null);
const saveDialogMock = vi.fn(async (_options?: unknown) => null as string | null);

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `http://asset.localhost/${path}`,
  invoke: (command: string, args?: Record<string, unknown>) =>
    invokeMock(command, args),
}));

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: (value: string) => writeTextMock(value),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  confirm: async () => false,
  open: (options?: unknown) => openDialogMock(options),
  save: (options?: unknown) => saveDialogMock(options),
}));

const PLAN_ITEM = {
  identity: { duration: 1440, sha256: "a".repeat(64), size: 300_000_000 },
  itemId: "i1",
  order: 0,
  sources: [],
  title: "Episode 1",
};

const EMPTY_STATUS: SessionStatus = {
  chat: [],
  hostOnline: false,
  lobbyRole: "viewer",
  missing: {},
  paths: {},
  peers: [],
  plan: [],
  ready: { allReady: false, peers: [] },
  role: null,
  sessionId: null,
  yourPeerId: null,
  ticket: null,
  waiting: null,
};

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

const HOST_STATUS: SessionStatus = {
  chat: [
    {
      id: "m1",
      at: 1_700_000_000,
      attachment: null,
      from: "Alice",
      links: [],
      replyTo: null,
      text: "hello",
    },
  ],
  hostOnline: true,
  lobbyRole: "host",
  missing: {},
  paths: {},
  peers: [HOST_PEER],
  plan: [PLAN_ITEM],
  ready: { allReady: true, peers: [{ peerId: "p1", ready: true }] },
  role: "host",
  sessionId: "a1b2c3d4e5f60718",
  yourPeerId: null,
  ticket: {
    endpointId: "ab".repeat(32),
    sessionId: "a1b2c3d4e5f60718",
    token: "0123456789abcdef0123456789abcdef",
  },
  waiting: null,
};

const MODERATOR_PEER = {
  ...HOST_PEER,
  displayName: "Mod",
  peerId: "p2",
  ready: true,
  role: "moderator" as const,
};

const VIEWER_PEER = {
  ...HOST_PEER,
  displayName: "Bob",
  peerId: "p3",
  ready: false,
  role: "viewer" as const,
};

/** The host with a moderator and a viewer; the roster order is shuffled. */
const HOST_WITH_PEERS_STATUS: SessionStatus = {
  ...HOST_STATUS,
  peers: [HOST_PEER, VIEWER_PEER, MODERATOR_PEER],
  ready: {
    allReady: false,
    peers: [
      { peerId: "p1", ready: true },
      { peerId: "p2", ready: true },
      { peerId: "p3", ready: false },
    ],
  },
};

const GUEST_STATUS: SessionStatus = {
  chat: [],
  hostOnline: true,
  lobbyRole: "viewer",
  missing: {},
  paths: {},
  peers: [
    HOST_PEER,
    {
      ...HOST_PEER,
      displayName: "Bob",
      peerId: "p2",
      ready: false,
      role: "viewer",
    },
  ],
  plan: [PLAN_ITEM],
  ready: {
    allReady: false,
    peers: [
      { peerId: "p1", ready: true },
      { peerId: "p2", ready: false },
    ],
  },
  role: "guest",
  sessionId: "a1b2c3d4e5f60718",
  yourPeerId: null,
  ticket: null,
  waiting: null,
};

const HOST_SEEDED_SOURCE = {
  kind: "hostSeeded" as const,
  label: "Episode 1.torrent",
  sourceId: "s1",
  status: "ready" as const,
  value: "magnet:?xt=urn:btih:abcdef01",
};

function torrentFile(index: number, name: string, size: number) {
  return {
    completed: false,
    exists: false,
    index,
    name,
    priority: "normal" as const,
    progress_bytes: 0,
    selected: true,
    size,
  };
}

const SINGLE_FILE_INFO = {
  conflicting_files: [],
  has_common_folder: false,
  id: 0,
  name: "Episode 1.mkv",
  files: [torrentFile(0, "Episode 1.mkv", 300_000_000)],
};

const MULTI_FILE_INFO = {
  conflicting_files: [],
  has_common_folder: true,
  id: 0,
  name: "Show",
  files: [
    torrentFile(0, "Show/Ep01.mkv", 300_000_000),
    torrentFile(1, "Show/Ep02.mkv", 300_000_100),
    torrentFile(2, "Show/Ep03.mkv", 300_000_200),
  ],
};

const GUEST_WITH_HOST_STATUS: SessionStatus = {
  ...GUEST_STATUS,
  plan: [{ ...PLAN_ITEM, sources: [HOST_SEEDED_SOURCE] }],
};

let client: QueryClient;

function mockInvoke(handler: (command: string) => unknown) {
  invokeMock.mockImplementation(async (command: string) => handler(command));
}

function renderWithClient(element: ReactElement) {
  return render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
  useSessionStore.setState({
    chatDraft: "",
    chatReply: null,
    displayName: "",
    identity: null,
    joinInput: "",
    pendingChats: [],
  });
  useCacheStore.setState({ lastSaveDir: "" });
  invokeMock.mockReset();
  writeTextMock.mockReset();
  writeTextMock.mockResolvedValue(undefined);
  openDialogMock.mockReset();
  openDialogMock.mockResolvedValue(null);
  saveDialogMock.mockReset();
  saveDialogMock.mockResolvedValue(null);
  resetTransportInflight();
  mockInvoke((command) => (command === "emoji_list" ? [] : EMPTY_STATUS));
  client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
});

afterEach(() => {
  cleanup();
});

describe("lobby route", () => {
  it("shows the create and join panes when no session is active", async () => {
    renderWithClient(<LobbyRoute />);

    expect(await screen.findByText("Create party")).toBeTruthy();
    expect(screen.getByText("Join a room")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Join room" })).toBeTruthy();
  });

  it("creates a party with the typed display name", async () => {
    const user = userEvent.setup();
    renderWithClient(<LobbyRoute />);

    await user.type(await screen.findByPlaceholderText("Your name"), "Alice");
    await user.click(screen.getByRole("button", { name: "Create party" }));

    await waitFor(() => {
      expect(
        invokeMock.mock.calls.some(
          ([command, args]) =>
            command === "session_create" &&
            JSON.stringify(args) === JSON.stringify({ displayName: "Alice" })
        )
      ).toBe(true);
    });
  });

  it("rejects a malformed ticket without dialing the host", async () => {
    const user = userEvent.setup();
    renderWithClient(<LobbyRoute />);

    await user.type(
      await screen.findByPlaceholderText("Paste the ticket you received"),
      "definitely-not-a-ticket"
    );
    await user.click(screen.getByRole("button", { name: "Join room" }));

    expect(
      await screen.findByText("That does not look like a valid ticket.")
    ).toBeTruthy();
    expect(invokeMock.mock.calls.some(([command]) => command === "session_join")).toBe(
      false
    );
  });

  it("joins with a pasted share string", async () => {
    const user = userEvent.setup();
    renderWithClient(<LobbyRoute />);

    const share = `iluhaanime://lobby/${btoa(
      JSON.stringify(HOST_STATUS.ticket)
    ).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;

    await user.type(
      await screen.findByPlaceholderText("Paste the ticket you received"),
      share
    );
    await user.click(screen.getByRole("button", { name: "Join room" }));

    await waitFor(() => {
      expect(
        invokeMock.mock.calls.some(([command]) => command === "session_join")
      ).toBe(true);
    });
  });

  it("keeps Join disabled until a ticket is typed", async () => {
    renderWithClient(<LobbyRoute />);

    const join = await screen.findByRole("button", { name: "Join room" });
    expect((join as HTMLButtonElement).disabled).toBe(true);
  });

  it("clears the invalid-ticket warning on the next keystroke", async () => {
    const user = userEvent.setup();
    renderWithClient(<LobbyRoute />);

    const input = await screen.findByPlaceholderText("Paste the ticket you received");
    await user.type(input, "nope");
    await user.click(screen.getByRole("button", { name: "Join room" }));
    expect(
      await screen.findByText("That does not look like a valid ticket.")
    ).toBeTruthy();

    await user.type(input, "x");
    expect(screen.queryByText("That does not look like a valid ticket.")).toBeNull();
  });

  it("reconnects a saved guest identity with the same peer id and name", async () => {
    const ticket = HOST_STATUS.ticket!;
    useSessionStore.setState({
      displayName: "Bob",
      identity: {
        sessionId: ticket.sessionId,
        ticket,
        displayName: "Bob",
        peerId: "p9",
        role: "guest",
      },
    });
    renderWithClient(<LobbyRoute />);

    await waitFor(() => {
      const call = invokeMock.mock.calls.find(([command]) => command === "session_join");
      expect(call?.[1]).toMatchObject({
        peerId: "p9",
        ticket,
        displayName: "Bob",
      });
    });
  });

  it("does not fake a reconnect while the status query is still pending", async () => {
    const ticket = HOST_STATUS.ticket!;
    useSessionStore.setState({
      identity: {
        sessionId: ticket.sessionId,
        ticket,
        displayName: "Bob",
        peerId: "p9",
        role: "guest",
      },
    });
    let resolveStatus: ((value: unknown) => void) | undefined;
    mockInvoke(
      (command) =>
        command === "session_status"
          ? new Promise((resolve) => {
              resolveStatus = resolve;
            })
          : EMPTY_STATUS
    );
    renderWithClient(<LobbyRoute />);

    expect(await screen.findByText("Checking session...")).toBeTruthy();
    expect(invokeMock.mock.calls.some(([command]) => command === "session_join")).toBe(
      false
    );

    resolveStatus?.(EMPTY_STATUS);
    await waitFor(() => {
      expect(invokeMock.mock.calls.some(([command]) => command === "session_join")).toBe(
        true
      );
    });
  });

  it("reports a closed host room instead of offering a dead reconnect", async () => {
    const user = userEvent.setup();
    const ticket = HOST_STATUS.ticket!;
    useSessionStore.setState({
      identity: {
        sessionId: ticket.sessionId,
        ticket,
        displayName: "Alice",
        peerId: null,
        role: "host",
      },
    });
    renderWithClient(<LobbyRoute />);

    expect(await screen.findByText("Room closed")).toBeTruthy();
    expect(invokeMock.mock.calls.some(([command]) => command === "session_join")).toBe(
      false
    );
    expect(screen.queryByRole("button", { name: "Create party" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Start over" }));

    expect(await screen.findByText("Create party")).toBeTruthy();
    expect(useSessionStore.getState().identity).toBeNull();
  });
});

describe("lobby room", () => {
  it("renders the invite, roster, and chat for a host", () => {
    renderWithClient(<RoomLobby status={HOST_STATUS} />);

    expect(screen.getByText("Invite")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
    expect(screen.getByText("hello")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Resync" })).toBeTruthy();
    expect(screen.getByText("Room A1B2 C3D4")).toBeTruthy();
  });

  it("copies the share string to the clipboard", async () => {
    const user = userEvent.setup();
    renderWithClient(<RoomLobby status={HOST_STATUS} />);

    await user.click(screen.getByRole("button", { name: "Copy" }));

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledTimes(1);
    });
    expect(String(writeTextMock.mock.calls[0]?.[0]).startsWith("iluhaanime://lobby/")).toBe(
      true
    );
    expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();
  });

  it("sends the chat draft and clears it", async () => {
    const user = userEvent.setup();
    renderWithClient(<RoomLobby status={HOST_STATUS} />);

    await user.type(screen.getByPlaceholderText("Message the room"), "hey there");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(
        invokeMock.mock.calls.some(
          ([command, args]) =>
            command === "session_chat" &&
            (args as { id?: string; text?: string }).text === "hey there" &&
            typeof (args as { id?: string }).id === "string" &&
            (args as { id?: string }).id!.length > 0
        )
      ).toBe(true);
    });
    await waitFor(() => {
      expect(useSessionStore.getState().chatDraft).toBe("");
    });
  });

  it("shows the armed reply in the composer and sends it with the line", async () => {
    const user = userEvent.setup();
    useSessionStore.setState({ chatReply: "m1" });
    renderWithClient(<RoomLobby status={HOST_STATUS} />);

    // The bar resolves the target from the visible history.
    expect(screen.getByText("Replying to Alice: hello")).toBeTruthy();

    await user.type(screen.getByPlaceholderText("Message the room"), "right?");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      const sent = invokeMock.mock.calls.find(
        ([command]) => command === "session_chat"
      )?.[1] as { replyTo?: string | null };
      expect(sent?.replyTo).toBe("m1");
    });
    await waitFor(() => {
      expect(useSessionStore.getState().chatReply).toBeNull();
    });
  });

  it("shows an optimistic copy until the server echoes the same id", async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithClient(<RoomLobby status={HOST_STATUS} />);

    await user.type(screen.getByPlaceholderText("Message the room"), "yo");
    await user.click(screen.getByRole("button", { name: "Send" }));

    // The line renders immediately, before any status poll carries it back.
    await screen.findByText("You:");

    const sent = invokeMock.mock.calls.find(
      ([command]) => command === "session_chat"
    )?.[1] as { id: string; text: string };
    expect(sent.text).toBe("yo");

    // The server copy arrives under the same id: only it survives.
    rerender(
      <QueryClientProvider client={client}>
        <RoomLobby
          status={{
            ...HOST_STATUS,
            chat: [
              ...HOST_STATUS.chat,
              {
                id: sent.id,
                at: 1_700_000_120,
                attachment: null,
                from: "Alice",
                links: [],
                replyTo: null,
                text: "yo",
              },
            ],
          }}
        />
      </QueryClientProvider>
    );

    await waitFor(() => expect(screen.queryByText("You:")).toBeNull());
    expect(screen.getAllByText("yo")).toHaveLength(1);
  });

  it("drops the optimistic copy when the send fails", async () => {
    const user = userEvent.setup();
    let rejectChat: ((error: Error) => void) | undefined;
    mockInvoke((command) => {
      if (command === "session_chat") {
        return new Promise((_resolve, reject) => {
          rejectChat = reject;
        });
      }
      return HOST_STATUS;
    });
    renderWithClient(<RoomLobby status={HOST_STATUS} />);

    await user.type(screen.getByPlaceholderText("Message the room"), "oops");
    await user.click(screen.getByRole("button", { name: "Send" }));

    // Visible while the send is still in flight...
    await screen.findByText("You:");
    rejectChat?.(new Error("nope"));

    // ...and gone once it fails, so a failed line never lingers as sent.
    await waitFor(() => expect(screen.queryByText("You:")).toBeNull());
    expect(useSessionStore.getState().pendingChats).toHaveLength(0);
  });

  it("starts a plan item from the playlist", async () => {
    const user = userEvent.setup();
    renderWithClient(<RoomLobby status={HOST_STATUS} />);

    const play = screen.getByRole("button", { name: "Play" });
    expect((play as HTMLButtonElement).disabled).toBe(false);

    await user.click(play);
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

  it("holds an item and names who it waits for", () => {
    renderWithClient(
      <RoomLobby
        status={{
          ...HOST_STATUS,
          missing: { i1: ["p2"] },
          peers: [...HOST_STATUS.peers, { ...HOST_PEER, displayName: "Kira", peerId: "p2", ready: false, role: "viewer" }],
          ready: {
            allReady: false,
            peers: [
              { peerId: "p1", ready: true },
              { peerId: "p2", ready: false },
            ],
          },
          waiting: { itemId: "i1", peerIds: ["p2"] },
        }}
      />
    );

    expect(
      (screen.getByRole("button", { name: "Play" }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(screen.getAllByText("Waiting for Kira").length).toBeGreaterThan(0);
  });

  it("adds a plan item from a local path", async () => {
    const user = userEvent.setup();
    mockInvoke((command) => {
      if (command === "media_identity") return PLAN_ITEM.identity;
      return EMPTY_STATUS;
    });
    renderWithClient(
      <RoomLobby
        status={{ ...HOST_STATUS, plan: [], ready: { allReady: false, peers: [] } }}
      />
    );

    await user.type(
      screen.getByPlaceholderText("Path to a video file"),
      "D:/anime/ep2.mkv"
    );
    await user.click(screen.getByRole("button", { name: "Add item" }));

    await waitFor(() => {
      expect(
        invokeMock.mock.calls.some(
          ([command, args]) =>
            command === "session_set_playlist" &&
            JSON.stringify(args).includes("ep2.mkv")
        )
      ).toBe(true);
    });
  });

  it("lets a guest mark a local file and report readiness", async () => {
    const user = userEvent.setup();
    mockInvoke((command) => {
      if (command === "media_identity") return PLAN_ITEM.identity;
      return GUEST_STATUS;
    });
    renderWithClient(<RoomLobby status={GUEST_STATUS} />);

    await user.type(
      screen.getByPlaceholderText("Path to your copy"),
      "D:/anime/ep1.mkv"
    );
    await user.click(screen.getByRole("button", { name: "Use my file" }));

    expect(await screen.findByText("Matched")).toBeTruthy();
    await waitFor(() => {
      expect(
        invokeMock.mock.calls.some(([command]) => command === "session_set_ready")
      ).toBe(true);
    });
  });

  it("lets the host open the torrent creator from a plan item", async () => {
    const user = userEvent.setup();
    renderWithClient(<RoomLobby status={HOST_STATUS} />);

    await user.click(screen.getByRole("button", { name: "Create torrent" }));

    expect(screen.getByText("Folder with the files:")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create" })).toBeTruthy();
  });

  it("attaches a created torrent to the plan item as a host source", async () => {
    const user = userEvent.setup();
    const created = {
      file_count: 1,
      id: 7,
      info_hash: "abcdef01",
      name: "Episode 1.torrent",
      torrent_path: "C:/torrents/ep1.torrent",
    };
    mockInvoke((command) => {
      if (command === "create_torrent_from_folder") return created;
      return HOST_STATUS;
    });
    openDialogMock.mockResolvedValue("D:/anime/Season 1");
    renderWithClient(<RoomLobby status={HOST_STATUS} />);

    await user.click(screen.getByRole("button", { name: "Create torrent" }));
    await user.click(screen.getByRole("button", { name: "Browse" }));
    await waitFor(() => {
      expect(screen.getByDisplayValue("D:/anime/Season 1")).toBeTruthy();
    });
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(
        invokeMock.mock.calls.some(
          ([command, args]) =>
            command === "session_add_source" &&
            JSON.stringify(args).includes("magnet:?xt=urn:btih:abcdef01")
        )
      ).toBe(true);
    });
  });

  it("lets a guest find a copy in a folder", async () => {
    const user = userEvent.setup();
    mockInvoke((command) =>
      command === "session_match_folder" ? "D:/anime/ep1.mkv" : GUEST_WITH_HOST_STATUS
    );
    openDialogMock.mockResolvedValue("D:/anime");
    renderWithClient(<RoomLobby status={GUEST_WITH_HOST_STATUS} />);

    await user.click(screen.getByRole("button", { name: "Pick folder" }));

    await waitFor(() => {
      expect(
        invokeMock.mock.calls.some(
          ([command, args]) =>
            command === "session_match_folder" &&
            JSON.stringify(args) ===
              JSON.stringify({ itemId: "i1", folder: "D:/anime" })
        )
      ).toBe(true);
    });
    expect(await screen.findByText("Matched")).toBeTruthy();
  });

  it("lets a guest download the host torrent", async () => {
    const user = userEvent.setup();
    mockInvoke((command) => {
      if (command === "get_torrent_info") return SINGLE_FILE_INFO;
      if (command === "start_torrent_download") return 1;
      return GUEST_WITH_HOST_STATUS;
    });
    openDialogMock.mockResolvedValue("D:/downloads");
    renderWithClient(<RoomLobby status={GUEST_WITH_HOST_STATUS} />);

    await user.click(screen.getByRole("button", { name: "Download from host" }));

    await waitFor(() => {
      const call = invokeMock.mock.calls.find(
        ([command]) => command === "start_torrent_download"
      );
      expect(call?.[1]).toMatchObject({
        onlyFiles: null,
        saveDir: "D:/downloads",
        subFolder: null,
      });
      expect(JSON.stringify(call?.[1])).toContain("magnet:?xt=urn:btih:abcdef01");
    });
    // A single-file torrent downloads directly, with no file picker.
    expect(screen.queryByRole("button", { name: "Download" })).toBeNull();
  });

  it("offers file selection for a multi-file host torrent", async () => {
    const user = userEvent.setup();
    mockInvoke((command) => {
      if (command === "get_torrent_info") return MULTI_FILE_INFO;
      if (command === "start_torrent_download") return 1;
      return GUEST_WITH_HOST_STATUS;
    });
    openDialogMock.mockResolvedValue("D:/downloads");
    renderWithClient(<RoomLobby status={GUEST_WITH_HOST_STATUS} />);

    await user.click(screen.getByRole("button", { name: "Download from host" }));

    // The picker opens with everything selected: the whole torrent downloads.
    await user.click(await screen.findByRole("button", { name: "Download" }));

    await waitFor(() => {
      const call = invokeMock.mock.calls.find(
        ([command]) => command === "start_torrent_download"
      );
      expect(call?.[1]).toMatchObject({ onlyFiles: null });
    });
  });

  it("downloads only the picked episodes from a multi-file host torrent", async () => {
    const user = userEvent.setup();
    mockInvoke((command) => {
      if (command === "get_torrent_info") return MULTI_FILE_INFO;
      if (command === "start_torrent_download") return 1;
      return GUEST_WITH_HOST_STATUS;
    });
    openDialogMock.mockResolvedValue("D:/downloads");
    renderWithClient(<RoomLobby status={GUEST_WITH_HOST_STATUS} />);

    await user.click(screen.getByRole("button", { name: "Download from host" }));
    await screen.findByRole("button", { name: "Download" });

    // Uncheck the second episode (the first checkbox selects everything).
    const boxes = await screen.findAllByRole("checkbox");
    await user.click(boxes[2]);
    await user.click(screen.getByRole("button", { name: "Download" }));

    await waitFor(() => {
      const call = invokeMock.mock.calls.find(
        ([command]) => command === "start_torrent_download"
      );
      expect(call?.[1]).toMatchObject({ onlyFiles: [0, 2] });
    });
  });

  it("warns a guest when the host goes offline", () => {
    renderWithClient(
      <RoomLobby status={{ ...GUEST_STATUS, hostOnline: false }} />
    );

    expect(screen.getByText("Host left")).toBeTruthy();
    expect(screen.getByText("Waiting for the host to reconnect.")).toBeTruthy();
  });

  it("renders the guest view without host-only controls", () => {
    renderWithClient(<RoomLobby status={GUEST_STATUS} />);

    expect(screen.getByText("Joined")).toBeTruthy();
    expect(screen.getByText("Room A1B2C3D4")).toBeTruthy();
    expect(screen.queryByText("Invite")).toBeNull();
    expect(screen.queryByRole("button", { name: "Resync" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Start" })).toBeNull();
    expect(screen.getByRole("button", { name: "Leave" })).toBeTruthy();
  });

  it("leaves the session from the header", async () => {
    const user = userEvent.setup();
    renderWithClient(<RoomLobby status={GUEST_STATUS} />);

    await user.click(screen.getByRole("button", { name: "Leave" }));

    await waitFor(() => {
      expect(invokeMock.mock.calls.some(([command]) => command === "session_leave")).toBe(
        true
      );
    });
  });

  it("asks the host what to do with the lobby before leaving", async () => {
    const user = userEvent.setup();
    renderWithClient(<RoomLobby status={HOST_STATUS} />);

    await user.click(screen.getByRole("button", { name: "Leave" }));

    expect(await screen.findByText("You are the host. Close the lobby for everyone, or hand the host rights to someone else?")).toBeTruthy();
    expect(invokeMock.mock.calls.some(([command]) => command === "session_leave")).toBe(
      false
    );
  });

  it("closes the lobby from the host leave dialog", async () => {
    const user = userEvent.setup();
    renderWithClient(<RoomLobby status={HOST_STATUS} />);

    await user.click(screen.getByRole("button", { name: "Leave" }));
    await user.click(await screen.findByRole("button", { name: "Close lobby" }));

    await waitFor(() => {
      expect(invokeMock.mock.calls.some(([command]) => command === "session_leave")).toBe(
        true
      );
    });
  });

  it("transfers the host rights to the hierarchy default from the leave dialog", async () => {
    const user = userEvent.setup();
    renderWithClient(<RoomLobby status={HOST_WITH_PEERS_STATUS} />);

    await user.click(screen.getByRole("button", { name: "Leave" }));

    // The moderator outranks the viewer, so the selector lands on them.
    const selector = await screen.findByRole("combobox", { name: "New host" });
    expect(selector.textContent).toContain("Mod");

    await user.click(screen.getByRole("button", { name: "Transfer and leave" }));

    await waitFor(() => {
      const call = invokeMock.mock.calls.find(
        ([command]) => command === "session_transfer_host"
      );
      expect(call?.[1]).toMatchObject({ peerId: "p2" });
    });
  });

  it("hides the transfer option when the host is alone", async () => {
    const user = userEvent.setup();
    renderWithClient(<RoomLobby status={HOST_STATUS} />);

    await user.click(screen.getByRole("button", { name: "Leave" }));

    expect(await screen.findByRole("button", { name: "Close lobby" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Transfer and leave" })).toBeNull();
  });

  it("force-resyncs every peer from the header", async () => {
    const user = userEvent.setup();
    renderWithClient(<RoomLobby status={HOST_STATUS} />);

    await user.click(screen.getByRole("button", { name: "Resync" }));

    await waitFor(() => {
      expect(
        invokeMock.mock.calls.some(([command]) => command === "session_force_resync")
      ).toBe(true);
    });
  });

  it("removes a plan item through the playlist", async () => {
    const user = userEvent.setup();
    renderWithClient(<RoomLobby status={HOST_STATUS} />);

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

  it("removes a host-seeded source from a plan item", async () => {
    const user = userEvent.setup();
    renderWithClient(
      <RoomLobby
        status={{ ...HOST_STATUS, plan: [{ ...PLAN_ITEM, sources: [HOST_SEEDED_SOURCE] }] }}
      />
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

  it("renders a chat link as an external anchor", () => {
    renderWithClient(
      <RoomLobby
        status={{
          ...HOST_STATUS,
          chat: [
            {
              id: "m2",
              at: 1_700_000_000,
              attachment: null,
              from: "Alice",
              links: [],
              replyTo: null,
              text: "open https://example.com/x",
            },
          ],
        }}
      />
    );

    const link = screen.getByRole("link", { name: "https://example.com/x" });
    expect(link.getAttribute("href")).toBe("https://example.com/x");
    expect(link.getAttribute("target")).toBe("_blank");
  });
});
