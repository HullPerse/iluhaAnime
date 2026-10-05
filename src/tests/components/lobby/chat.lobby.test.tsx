import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetTransportInflight } from "@/api/transport.api";
import ChatLobby from "@/routes/components/lobby/chat.lobby";
import { useSettingsStore } from "@/store/settings.store";
import type { ChatMessage, PinnedMessage } from "@/types/session";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `http://asset.localhost/${path}`,
  invoke: (command: string, args?: Record<string, unknown>) => invokeMock(command, args),
}));

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "m1",
    at: 1_700_000_000,
    attachment: null,
    from: "Alice",
    links: [],
    replyTo: null,
    text: "hello",
    ...overrides,
  };
}

let client: QueryClient;

function chatElement(props: {
  attachPending?: boolean;
  canAttach?: boolean;
  canPin?: boolean;
  draft?: string;
  failedAttachment?: string | null;
  fetchingAttachment?: string | null;
  messages?: ChatMessage[];
  mentionNames?: string[];
  onAttach?: () => void;
  onDownloadAttachment?: (messageId: string) => void;
  onDraftChange?: (value: string) => void;
  onPin?: (messageId: string | null) => void;
  onReplyChange?: (id: string | null) => void;
  onSend?: () => void;
  onTorrentLink?: (token: string) => void;
  pending?: boolean;
  pinned?: PinnedMessage | null;
  pinnedByName?: string;
  replyTo?: string | null;
  typingNames?: string[];
}) {
  return (
    <QueryClientProvider client={client}>
      <ChatLobby
        attachPending={props.attachPending ?? false}
        canAttach={props.canAttach ?? false}
        canPin={props.canPin ?? false}
        draft={props.draft ?? ""}
        failedAttachment={props.failedAttachment ?? null}
        fetchingAttachment={props.fetchingAttachment ?? null}
        messages={props.messages ?? []}
        mentionNames={props.mentionNames ?? []}
        onAttach={props.onAttach ?? (() => undefined)}
        onDownloadAttachment={props.onDownloadAttachment ?? (() => undefined)}
        onDraftChange={props.onDraftChange ?? (() => undefined)}
        onPin={props.onPin}
        onReplyChange={props.onReplyChange}
        onSend={props.onSend ?? (() => undefined)}
        onTorrentLink={props.onTorrentLink ?? (() => undefined)}
        pending={props.pending ?? false}
        pinned={props.pinned ?? null}
        pinnedByName={props.pinnedByName ?? ""}
        replyTo={props.replyTo ?? null}
        typingNames={props.typingNames ?? []}
      />
    </QueryClientProvider>
  );
}

function renderChat(props: Parameters<typeof chatElement>[0]) {
  return render(chatElement(props));
}

/**
 * Chat lines are split into one span per token, so a whole line never lives in
 * a single text node. Match on the `<li>` text content instead.
 */
function messageLine(text: string): HTMLElement {
  return screen.getByText((_content, element) => {
    if (element?.tagName !== "LI") return false;
    return (element.textContent ?? "").endsWith(`: ${text}`);
  });
}

beforeEach(() => {
  useSettingsStore.setState({ language: "en", chatImagePreviews: true });
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(undefined);
  resetTransportInflight();
  client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
});

afterEach(() => {
  cleanup();
});

describe("ChatLobby", () => {
  it("shows an empty placeholder before any message", () => {
    renderChat({});

    expect(screen.getByText("Chat")).toBeTruthy();
    expect(screen.getByText("No messages yet.")).toBeTruthy();
  });

  it("renders each message with its sender", () => {
    renderChat({
      messages: [
        message({ from: "Alice", text: "hello" }),
        message({ at: 1_700_000_060, from: "Bob", text: "hi there" }),
      ],
    });

    expect(messageLine("hello")).toBeTruthy();
    expect(messageLine("hi there")).toBeTruthy();
    expect(screen.getByText("Alice:")).toBeTruthy();
    expect(screen.getByText("Bob:")).toBeTruthy();
  });

  it("shows a single peer typing above the input", () => {
    renderChat({ typingNames: ["Alice"] });

    expect(screen.getByText("Alice is typing…")).toBeTruthy();
  });

  it("joins several typing peers into one line", () => {
    renderChat({ typingNames: ["Alice", "Bob"] });

    expect(screen.getByText("Alice, Bob are typing…")).toBeTruthy();
  });

  it("keeps the typing line hidden while nobody types", () => {
    renderChat({ typingNames: [] });

    expect(screen.queryByText(/is typing/)).toBeNull();
    expect(screen.queryByText(/are typing/)).toBeNull();
  });

  it("renders URLs in a message as external links", () => {
    renderChat({
      messages: [message({ text: "see https://example.com/x now" })],
    });

    const link = screen.getByRole("link", { name: "https://example.com/x" });
    expect(link.getAttribute("href")).toBe("https://example.com/x");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noreferrer");
  });

  it("keeps a plain message as text without links", () => {
    renderChat({ messages: [message({ text: "no links here" })] });

    expect(screen.queryByRole("link")).toBeNull();
    expect(messageLine("no links here")).toBeTruthy();
  });

  it("disables Send while the draft is empty or pending", () => {
    const { rerender } = renderChat({ draft: "" });
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(
      true
    );

    rerender(
      <QueryClientProvider client={client}>
        <ChatLobby
          canAttach={false}
          draft="hi"
          messages={[]}
          onAttach={() => undefined}
          onDownloadAttachment={() => undefined}
          onDraftChange={() => undefined}
          onSend={() => undefined}
          onTorrentLink={() => undefined}
          pending
        />
      </QueryClientProvider>
    );
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(
      true
    );

    rerender(
      <QueryClientProvider client={client}>
        <ChatLobby
          canAttach={false}
          draft="hi"
          messages={[]}
          onAttach={() => undefined}
          onDownloadAttachment={() => undefined}
          onDraftChange={() => undefined}
          onSend={() => undefined}
          onTorrentLink={() => undefined}
          pending={false}
        />
      </QueryClientProvider>
    );
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(
      false
    );
  });

  it("reports draft edits and submits the form", async () => {
    const user = userEvent.setup();
    const onDraftChange = vi.fn();
    const onSend = vi.fn();
    renderChat({ draft: "hi", onDraftChange, onSend });

    await user.type(screen.getByPlaceholderText("Message the room"), "!");
    expect(onDraftChange).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("routes a magnet link through the torrent flow instead of an anchor", async () => {
    const user = userEvent.setup();
    const onTorrentLink = vi.fn();
    const magnet = "magnet:?xt=urn:btih:ABCDEF0123456789ABCDEF0123456789ABCDEF01";
    renderChat({ messages: [message({ text: `grab ${magnet}` })], onTorrentLink });

    expect(screen.queryByRole("link")).toBeNull();
    await user.click(screen.getByRole("button", { name: magnet }));
    expect(onTorrentLink).toHaveBeenCalledTimes(1);
    expect(onTorrentLink).toHaveBeenCalledWith(magnet);
  });

  it("routes an iluhaanime torrent deep link through the torrent flow", async () => {
    const user = userEvent.setup();
    const onTorrentLink = vi.fn();
    const link = `iluhaanime://torrent/${"ab".repeat(20)}`;
    renderChat({ messages: [message({ text: link })], onTorrentLink });

    expect(screen.queryByRole("link")).toBeNull();
    await user.click(screen.getByRole("button", { name: link }));
    expect(onTorrentLink).toHaveBeenCalledWith(link);
  });

  it("shows an attachment card and downloads it on click", async () => {
    const user = userEvent.setup();
    const onDownloadAttachment = vi.fn();
    renderChat({
      messages: [
        message({
          attachment: { name: "Episode 1.torrent", size: 1024 },
          text: "",
        }),
      ],
      onDownloadAttachment,
    });

    expect(screen.getByText("Episode 1.torrent")).toBeTruthy();
    const button = screen.getByRole("button", { name: "Download" });
    await user.click(button);
    expect(onDownloadAttachment).toHaveBeenCalledTimes(1);
    expect(onDownloadAttachment).toHaveBeenCalledWith("m1");
  });

  it("disables the attachment card while its bytes are being fetched", () => {
    renderChat({
      fetchingAttachment: "m1",
      messages: [
        message({
          attachment: { name: "Episode 1.torrent", size: 1024 },
          text: "",
        }),
      ],
    });

    const button = screen.getByRole("button", {
      name: "Loading...",
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText("Episode 1.torrent")).toBeTruthy();
  });

  it("shows a retry button after a failed fetch", async () => {
    const user = userEvent.setup();
    const onDownloadAttachment = vi.fn();
    renderChat({
      failedAttachment: "m1",
      messages: [
        message({
          attachment: { name: "Episode 1.torrent", size: 1024 },
          text: "",
        }),
      ],
      onDownloadAttachment,
    });

    const button = screen.getByRole("button", { name: "Retry" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    await user.click(button);
    expect(onDownloadAttachment).toHaveBeenCalledWith("m1");
  });

  it("renders a known custom emoji shortcode as an image", async () => {
    invokeMock.mockImplementation(async (command: string) =>
      command === "emoji_list"
        ? [{ name: "iluha_cat", path: "D:/emoji/iluha_cat.png" }]
        : undefined,
    );
    renderChat({ messages: [message({ text: "watch :iluha_cat: now" })] });

    const img = await screen.findByTitle(":iluha_cat:");
    expect(img.getAttribute("alt")).toBe(":iluha_cat:");
    expect(img.getAttribute("src")).toBe("http://asset.localhost/D:/emoji/iluha_cat.png");
  });

  it("keeps an unknown custom emoji shortcode as literal text", () => {
    renderChat({ messages: [message({ text: "hi :iluha_missing:" })] });

    expect(screen.getByText(":iluha_missing:")).toBeTruthy();
  });

  it("shows a quote line for a reply and jumps to the quoted message", () => {
    const first = message({ id: "m1", text: "hello there" });
    const second = message({ id: "m2", replyTo: "m1", text: "agreed" });
    renderChat({ messages: [first, second] });

    const quote = screen.getByRole("button", {
      name: "Jump to the quoted message",
    });
    expect(quote.textContent).toBe("Alice: hello there");

    const target = messageLine("hello there");
    const scrollIntoView = vi.fn();
    target.scrollIntoView = scrollIntoView;
    fireEvent.click(quote);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "center" });
  });

  it("marks a quote whose target left the history", () => {
    renderChat({
      messages: [message({ id: "m2", replyTo: "gone", text: "x" })],
    });

    expect(screen.getByText("Reply unavailable")).toBeTruthy();
  });

  it("arms the reply from a message row and cancels it from the bar", () => {
    const onReplyChange = vi.fn();
    const source = message({ id: "m1", text: "pick me" });
    const { rerender } = renderChat({ messages: [source], onReplyChange });

    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    expect(onReplyChange).toHaveBeenCalledWith("m1");

    rerender(chatElement({ messages: [source], onReplyChange, replyTo: "m1" }));
    expect(screen.getByText("Replying to Alice: pick me")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Cancel reply" }));
    expect(onReplyChange).toHaveBeenCalledWith(null);
  });

  it("offers roster names while the draft ends with @partial", () => {
    renderChat({ draft: "@ali", mentionNames: ["Alice", "Bob"] });

    const menu = screen.getByRole("menu", { name: "Mention suggestions" });
    expect(menu.textContent).toContain("Alice");
    expect(menu.textContent).not.toContain("Bob");
  });

  it("inserts @Name into the draft from the menu", () => {
    const onDraftChange = vi.fn();
    renderChat({
      draft: "hi @al",
      mentionNames: ["Alice Smith"],
      onDraftChange,
    });

    // mousedown: the menu keeps the composer focused while it inserts.
    fireEvent.mouseDown(screen.getByRole("menuitem", { name: "Alice Smith" }));
    expect(onDraftChange).toHaveBeenCalledWith("hi @Alice Smith ");
  });

  it("picks the highlighted name with Enter and hides the menu on Escape", () => {
    const onDraftChange = vi.fn();
    const onSend = vi.fn();
    const { rerender } = renderChat({
      draft: "@a",
      mentionNames: ["Alice", "Alan"],
      onDraftChange,
      onSend,
    });

    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "Enter" });
    // Enter completes the mention instead of sending the draft.
    expect(onDraftChange).toHaveBeenCalledWith("@Alice ");
    expect(onSend).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "Escape" });
    rerender(
      chatElement({
        draft: "@a",
        mentionNames: ["Alice", "Alan"],
        onDraftChange,
        onSend,
      })
    );
    expect(screen.queryByRole("menu", { name: "Mention suggestions" })).toBeNull();
  });

  it("highlights @name in a rendered message when the roster is known", () => {
    renderChat({
      messages: [message({ text: "ping @Alice now" })],
      mentionNames: ["Alice"],
    });

    const mention = screen.getByText("@Alice");
    expect(mention.className).toContain("font-bold");
    // Without a roster the same text stays a plain token (no highlight).
    cleanup();
    renderChat({ messages: [message({ text: "ping @Alice now" })] });
    expect(screen.getByText("@Alice").className).not.toContain("font-bold");
  });

  it("wraps bold, italic and strike spans in their formatting classes", () => {
    renderChat({
      messages: [
        message({ text: "**loud** *soft* ~~gone~~" }),
      ],
    });

    const loud = screen.getByText("loud");
    expect(loud.parentElement?.className).toContain("font-bold");
    const soft = screen.getByText("soft");
    expect(soft.parentElement?.className).toContain("italic");
    const gone = screen.getByText("gone");
    expect(gone.parentElement?.className).toContain("line-through");
  });

  it("hides a spoiler behind a reveal bar and shows it on click", async () => {
    const user = userEvent.setup();
    renderChat({ messages: [message({ text: "psst ||secret|| ok" })] });

    // The spoiler text is laid out (for width) but covered by the bar.
    const reveal = screen.getByRole("button", { name: "Show spoiler" });
    expect(screen.getByText("secret").closest("span")).toBeTruthy();

    await user.click(reveal);
    expect(screen.queryByRole("button", { name: "Show spoiler" })).toBeNull();
    // Revealed: the text now sits in a plain span with no cover button.
    expect(screen.getByText("secret")).toBeTruthy();
  });

  it("keeps an unclosed spoiler as plain visible text", () => {
    renderChat({ messages: [message({ text: "||open end" })] });

    expect(screen.queryByRole("button", { name: "Show spoiler" })).toBeNull();
    expect(messageLine("||open end")).toBeTruthy();
  });

  it("hides the attach button for viewers", () => {
    renderChat({ canAttach: false });

    expect(screen.queryByRole("button", { name: ".torrent" })).toBeNull();
  });

  it("lets a host attach a .torrent and disables it while pending", async () => {
    const user = userEvent.setup();
    const onAttach = vi.fn();
    const { rerender } = renderChat({ canAttach: true, onAttach });

    const attach = screen.getByRole("button", { name: ".torrent" });
    await user.click(attach);
    expect(onAttach).toHaveBeenCalledTimes(1);

    rerender(
      <QueryClientProvider client={client}>
        <ChatLobby
          attachPending
          canAttach
          draft=""
          fetchingAttachment={null}
          messages={[]}
          onAttach={onAttach}
          onDownloadAttachment={() => undefined}
          onDraftChange={() => undefined}
          onSend={() => undefined}
          onTorrentLink={() => undefined}
          pending={false}
        />
      </QueryClientProvider>
    );
    expect(
      (screen.getByRole("button", { name: ".torrent" }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  /** The scroll container: direct parent of the message list (or the empty note). */
  function scrollContainer(): HTMLElement {
    const list = screen.queryByRole("list") ?? screen.getByText("No messages yet.");
    return list.parentElement as HTMLElement;
  }

  it("scrolls to the newest line while the reader is at the bottom", () => {
    const first = message();
    const { rerender } = renderChat({ messages: [first] });

    const sentinel = scrollContainer().querySelector(":scope > div") as HTMLElement;
    const scrollIntoView = vi.fn();
    sentinel.scrollIntoView = scrollIntoView;

    rerender(chatElement({ messages: [first, message({ id: "m2", text: "second" })] }));

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "1 new messages" })).toBeNull();
  });

  it("offers an N-new pill instead of jumping while the reader is scrolled up", async () => {
    const user = userEvent.setup();
    const first = message();
    const { rerender } = renderChat({ messages: [first] });

    const scroll = scrollContainer();
    // Content is tall and the reader sits far above the newest line.
    Object.defineProperty(scroll, "scrollHeight", { configurable: true, value: 1000 });
    Object.defineProperty(scroll, "clientHeight", { configurable: true, value: 100 });
    fireEvent.scroll(scroll);

    rerender(chatElement({ messages: [first, message({ id: "m2", text: "second" })] }));

    const pill = await screen.findByRole("button", { name: "1 new messages" });
    await user.click(pill);
    expect(screen.queryByRole("button", { name: "1 new messages" })).toBeNull();
  });

  it("counts every arrival while the reader is away", async () => {
    const first = message();
    const { rerender } = renderChat({ messages: [first] });

    const scroll = scrollContainer();
    Object.defineProperty(scroll, "scrollHeight", { configurable: true, value: 1000 });
    Object.defineProperty(scroll, "clientHeight", { configurable: true, value: 100 });
    fireEvent.scroll(scroll);

    rerender(
      chatElement({
        messages: [
          first,
          message({ id: "m2", text: "second" }),
          message({ id: "m3", text: "third" }),
        ],
      })
    );

    expect(await screen.findByRole("button", { name: "2 new messages" })).toBeTruthy();
  });

  describe("image previews", () => {
    const image = "https://cdn.example.com/pic.png";

    it("embeds an https image link under the message", () => {
      renderChat({ messages: [message({ text: `see ${image}` })] });

      expect(document.querySelector(`img[src="${image}"]`)).toBeTruthy();
    });

    it("skips http and non-image links", () => {
      renderChat({
        messages: [
          message({
            id: "m2",
            text: "http://plain.example.com/a.png https://site.example.com/page",
          }),
        ],
      });

      expect(document.querySelector("img")).toBeNull();
    });

    it("toggles previews from the chat titlebar", () => {
      renderChat({ messages: [message({ text: `see ${image}` })] });

      const toggle = screen.getByRole("button", { name: "Image previews" });
      expect(toggle.getAttribute("aria-pressed")).toBe("true");

      fireEvent.click(toggle);
      expect(document.querySelector("img")).toBeNull();
      expect(toggle.getAttribute("aria-pressed")).toBe("false");
    });
  });

  describe("emoji picker", () => {
    it("opens on the emoji button and closes on outside click", async () => {
      renderChat({});

      fireEvent.click(screen.getByRole("button", { name: "Emoji" }));
      expect(await screen.findByPlaceholderText("Search emoji")).toBeTruthy();

      fireEvent.mouseDown(document.body);
      expect(screen.queryByPlaceholderText("Search emoji")).toBeNull();
    });

    it("closes on Escape", async () => {
      renderChat({});

      fireEvent.click(screen.getByRole("button", { name: "Emoji" }));
      await screen.findByPlaceholderText("Search emoji");

      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByPlaceholderText("Search emoji")).toBeNull();
    });
  });

  describe("pin banner", () => {
    it("renders the pinned strip and jumps to the anchor", () => {
      renderChat({
        messages: [message({ id: "m1", text: "hello there" })],
        pinned: { messageId: "m1", pinnedBy: "p9" },
        pinnedByName: "Alice",
      });

      const banner = screen.getByRole("button", {
        name: "Jump to the pinned message",
      });
      expect(banner.textContent).toContain("Pinned by Alice");
      expect(banner.textContent).toContain("hello there");

      const target = messageLine("hello there");
      const scrollIntoView = vi.fn();
      target.scrollIntoView = scrollIntoView;
      fireEvent.click(banner);
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "center" });
    });

    it("notes when the pinned anchor has left the history", () => {
      renderChat({
        messages: [message({ id: "m2", text: "later" })],
        pinned: { messageId: "gone", pinnedBy: "p9" },
        pinnedByName: "Alice",
      });

      const banner = screen.getByRole("button", {
        name: "Jump to the pinned message",
      });
      expect(banner.textContent).toContain("Pinned message unavailable");
    });

    it("falls back to the raw peer id without a roster name", () => {
      renderChat({
        messages: [message({ id: "m1" })],
        pinned: { messageId: "m1", pinnedBy: "p9" },
      });

      expect(screen.getByText("Pinned by p9")).toBeTruthy();
    });

    it("unpins through the banner when the room may pin", () => {
      const onPin = vi.fn();
      renderChat({
        canPin: true,
        messages: [message()],
        onPin,
        pinned: { messageId: "m1", pinnedBy: "p2" },
      });

      fireEvent.click(screen.getByRole("button", { name: "Unpin" }));
      expect(onPin).toHaveBeenCalledWith(null);
    });

    it("hides the unpin button without pin rights", () => {
      renderChat({
        canPin: false,
        messages: [message()],
        pinned: { messageId: "m1", pinnedBy: "p2" },
      });

      expect(screen.queryByRole("button", { name: "Unpin" })).toBeNull();
    });
  });
});
