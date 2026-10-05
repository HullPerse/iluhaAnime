import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  Download,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Reply,
  Smile,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { LOBBY_CHAT_MAX_GRAPHEMES } from "@/config/lobby/common.config";
import { useCustomEmoji } from "@/hooks/emoji.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { useMentionAutocomplete } from "@/hooks/session/mention.hook";
import {
  chatSegments,
  countGraphemes,
  formatChatClock,
  imagePreviewLinks,
  isTorrentLink,
} from "@/lib/session/chat.utils";
import { formatBytes } from "@/lib/utils/bytes.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { ChatMessage } from "@/types/session";

/** How close to the bottom (px) still counts as "following" the chat. */
const NEAR_BOTTOM_PX = 32;

/** One line, bounded — the quote shown above a reply and in the composer bar. */
function replySnippet(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 60 ? `${flat.slice(0, 57)}…` : flat;
}

/** Lazy: the emoji data bundle loads only on the first picker open. */
const EmojiPanel = lazy(() => import("./emoji.lobby"));

interface ChatLobbyProps {
  messages: ChatMessage[];
  draft: string;
  pending: boolean;
  /** Host + moderators may attach a `.torrent` (lobby.md §14.4). */
  canAttach: boolean;
  /** An attach send is in flight. */
  attachPending?: boolean;
  /** A `.torrent` attachment fetch is in flight (message id). */
  fetchingAttachment?: string | null;
  /** The `.torrent` attachment fetch that failed (message id, retry shown). */
  failedAttachment?: string | null;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  /** Message id the composer is replying to (local UI state, `null` = none). */
  replyTo?: string | null;
  /** Sets / clears the reply target (null cancels the reply). */
  onReplyChange?: (id: string | null) => void;
  /** A magnet / `iluhaanime://torrent/<hex>` link was clicked. */
  onTorrentLink: (token: string) => void;
  /** The attach button was clicked (opens the file dialog upstream). */
  onAttach: () => void;
  /** The attachment row was clicked (downloads it). */
  onDownloadAttachment: (messageId: string) => void;
  /** Peers currently typing, as display names (shown above the input). */
  typingNames?: string[];
  /** Roster display names used to detect and complete `@mentions`. */
  mentionNames?: string[];
}

export default function ChatLobby({
  messages,
  draft,
  pending,
  canAttach,
  attachPending = false,
  failedAttachment = null,
  fetchingAttachment = null,
  onDraftChange,
  onSend,
  replyTo = null,
  onReplyChange,
  onTorrentLink,
  onAttach,
  onDownloadAttachment,
  typingNames = [],
  mentionNames = [],
}: ChatLobbyProps) {
  const { t } = useI18n();
  const customEmoji = useCustomEmoji();
  const imagePreviews = useSettingsStore((state) => state.chatImagePreviews);
  const patch = useSettingsStore((state) => state.patch);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);
  const prevCountRef = useRef(0);
  const count = messages.length;
  const [unread, setUnread] = useState(0);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const emojiRef = useRef<HTMLDivElement>(null);
  // Reply: resolve the composer target for its preview bar and index messages
  // so each quote line can look up what it points at (O(1), not a find-in-map).
  const replyTarget =
    replyTo !== null ? (messages.find((m) => m.id === replyTo) ?? null) : null;
  const messagesById = useMemo(
    () => new Map(messages.map((message) => [message.id, message])),
    [messages],
  );

  // @mention autocomplete lives in its own hook: query detection, menu state,
  // keyboard navigation and draft rewriting (lobby.md §14 chat).
  const mention = useMentionAutocomplete(draft, mentionNames, onDraftChange);
  const handleMentionKeyDown = mention.onKeyDown;

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView?.({ block: "end" });
  }, []);

  // Follow the chat only while the reader is already at the bottom;
  // otherwise count arrivals for the "N new" pill. Shrinks (history trim,
  // optimistic-echo reconciliation) never count as arrivals.
  useEffect(() => {
    const delta = count - prevCountRef.current;
    prevCountRef.current = count;
    if (count === 0 || delta <= 0) return;
    if (followRef.current) {
      scrollToBottom();
      setUnread(0);
    } else {
      setUnread((value) => value + delta);
    }
  }, [count, scrollToBottom]);

  const handleScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    const nearBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight <=
      NEAR_BOTTOM_PX;
    followRef.current = nearBottom;
    if (nearBottom) setUnread(0);
  };

  const jumpToLatest = () => {
    followRef.current = true;
    setUnread(0);
    scrollToBottom();
  };

  // Reply navigation: center the row a quote points at (ids are ascii
  // alnum/-/_ only, so the selector is always safe).
  const scrollToMessage = (id: string) => {
    const element = scrollRef.current?.querySelector(
      `[data-message-id="${id}"]`
    );
    element?.scrollIntoView?.({ block: "center" });
  };

  // Close the emoji picker on outside click or Escape while it is open.
  useEffect(() => {
    if (!emojiOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!emojiRef.current?.contains(event.target as Node)) {
        setEmojiOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setEmojiOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [emojiOpen]);

  const handleEmojiPick = useCallback(
    (emoji: string) => {
      onDraftChange(draft + emoji);
    },
    [draft, onDraftChange],
  );

  return (
    <section className="ui-panel flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="ui-titlebar">
        <span className="text-title-text font-bold">
          {t("lobby.chat.title")}
        </span>
        <Button
          aria-pressed={imagePreviews}
          className="ml-auto"
          onClick={() => patch({ chatImagePreviews: !imagePreviews })}
          size="icon"
          title={t("lobby.chat.images")}
          type="button"
        >
          <ImageIcon />
        </Button>
      </div>
      <div
        ref={scrollRef}
        className="relative min-h-0 flex-1 overflow-auto p-2"
        onScroll={handleScroll}
      >
        {count === 0 ? (
          <p className="windows95-text text-hint text-xs">
            {t("lobby.chat.empty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {messages.map((message, index) => {
              const attachBusy = fetchingAttachment === message.id;
              const attachFailed = failedAttachment === message.id;
              const attachLabel = attachBusy
                ? t("lobby.chat.attachment.loading")
                : attachFailed
                  ? t("lobby.chat.attachment.retry")
                  : t("lobby.chat.attachment.download");
              const replyId = message.replyTo ?? null;
              const quoted =
                replyId !== null ? (messagesById.get(replyId) ?? null) : null;
              return (
              <li
                className="group windows95-text text-xs whitespace-pre-wrap"
                data-message-id={message.id || undefined}
                key={message.id || `${message.at}-${index}`}
              >
                {replyId !== null && (
                  <button
                    aria-label={t("lobby.chat.reply.jump")}
                    className="text-hint mb-0.5 flex w-full min-w-0 items-center gap-1 text-left"
                    onClick={() => {
                      if (replyId !== null) scrollToMessage(replyId);
                    }}
                    title={t("lobby.chat.reply.jump")}
                    type="button"
                  >
                    <Reply className="text-highlight size-3 shrink-0" />
                    <span className="min-w-0 truncate">
                      {quoted !== null
                        ? `${quoted.from}: ${replySnippet(quoted.text)}`
                        : t("lobby.chat.reply.unavailable")}
                    </span>
                  </button>
                )}
                <span className="text-hint">
                  [{formatChatClock(message.at)}]{" "}
                </span>
                <span className="text-highlight font-bold">
                  {message.from}:{" "}
                </span>
                <span className="text-text">
                  {chatSegments(message.text, mentionNames).map((segment, segmentIndex) =>
                    segment.kind === "link" ? (
                      isTorrentLink(segment.value) ? (
                        <button
                          className="text-highlight underline"
                          key={segmentIndex}
                          onClick={() => onTorrentLink(segment.value)}
                          type="button"
                        >
                          {segment.value}
                        </button>
                      ) : (
                        <a
                          className="text-highlight underline"
                          href={segment.value}
                          key={segmentIndex}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {segment.value}
                        </a>
                      )
                    ) : segment.kind === "emoji" ? (
                      customEmoji.has(segment.value) ? (
                        <img
                          alt={`:${segment.value}:`}
                          className="inline-block size-4 align-[-0.25em]"
                          key={segmentIndex}
                          src={customEmoji.get(segment.value)}
                          title={`:${segment.value}:`}
                        />
                      ) : (
                        <span key={segmentIndex}>{`:${segment.value}:`}</span>
                      )
                    ) : segment.kind === "mention" ? (
                      <span
                        className="windows95-active text-text px-0.5 font-bold"
                        key={segmentIndex}
                      >
                        {segment.value}
                      </span>
                    ) : (
                      <span key={segmentIndex}>{segment.value}</span>
                    )
                  )}
                </span>
                <button
                  aria-label={t("lobby.chat.reply")}
                  className="group-focus-within:opacity-100 group-hover:opacity-100 ml-1 inline-flex size-3.5 align-middle opacity-0"
                  onClick={() => onReplyChange?.(message.id)}
                  title={t("lobby.chat.reply")}
                  type="button"
                >
                  <Reply className="size-3.5" />
                </button>
                {message.attachment !== null && message.attachment !== undefined && (
                  <div className="bg-field windows95-3d-border mt-1 flex w-fit max-w-full items-center gap-2 px-2 py-1">
                    <Paperclip className="text-highlight size-4 shrink-0" />
                    <span
                      className="max-w-[24ch] truncate"
                      title={message.attachment.name}
                    >
                      {message.attachment.name}
                    </span>
                    <span className="text-hint">
                      {formatBytes(message.attachment.size)}
                    </span>
                    <Button
                      disabled={attachBusy}
                      onClick={() => onDownloadAttachment(message.id)}
                      title={attachLabel}
                      type="button"
                    >
                      {attachBusy ? (
                        <Loader2 className="animate-spin" />
                      ) : attachFailed ? (
                        <AlertTriangle className="text-destructive" />
                      ) : (
                        <Download />
                      )}
                      {attachLabel}
                    </Button>
                  </div>
                )}
                {imagePreviews &&
                  imagePreviewLinks(message.text).map((url) => (
                    <a
                      className="mt-1 block w-fit"
                      href={url}
                      key={url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <img
                        alt=""
                        className="border border-muted max-h-40 max-w-[240px] object-contain"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        src={url}
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                        }}
                      />
                    </a>
                  ))}
              </li>
              );
            })}
          </ul>
        )}
        <div ref={bottomRef} />
        {unread > 0 && (
          <button
            className="windows95-text text-highlight sticky bottom-0 left-1/2 mx-auto block w-fit -translate-x-1/2 border border-muted bg-background px-2 py-0.5 text-xs font-bold"
            onClick={jumpToLatest}
            type="button"
          >
            {t("lobby.chat.new", { count: unread })}
          </button>
        )}
      </div>
      {typingNames.length > 0 && (
        <p className="windows95-text text-hint px-1 text-xs italic">
          {typingNames.length === 1
            ? t("lobby.chat.typing.one", { name: typingNames[0] })
            : t("lobby.chat.typing.many", { names: typingNames.join(", ") })}
        </p>
      )}
      {replyTo !== null && (
        <div className="bg-field windows95-3d-border mx-1 mb-1 flex items-center gap-1 px-2 py-1">
          <Reply className="text-highlight size-3 shrink-0" />
          <span className="windows95-text text-hint min-w-0 flex-1 truncate text-xs">
            {replyTarget !== null
              ? t("lobby.chat.replyingTo", {
                  from: replyTarget.from,
                  snippet: replySnippet(replyTarget.text),
                })
              : t("lobby.chat.reply.unavailable")}
          </span>
          <Button
            aria-label={t("lobby.chat.reply.cancel")}
            onClick={() => onReplyChange?.(null)}
            size="icon"
            title={t("lobby.chat.reply.cancel")}
            type="button"
          >
            <X />
          </Button>
        </div>
      )}
      <div ref={emojiRef} className="relative">
        {emojiOpen && (
          <div className="absolute bottom-full left-1 z-20 mb-1">
            <div className="ui-panel p-1">
              <Suspense
                fallback={
                  <p className="windows95-text text-hint p-3 text-xs">
                    {t("lobby.chat.emoji.loading")}
                  </p>
                }
              >
                <EmojiPanel onPick={handleEmojiPick} />
              </Suspense>
            </div>
          </div>
        )}
        {mention.open && (
          <div
            aria-label={t("lobby.chat.mention.menu")}
            className="ui-panel absolute bottom-full left-1 z-20 mb-1 w-48 p-1"
            role="menu"
          >
            {mention.matches.map((name, index) => (
              <button
                aria-current={index === mention.activeIndex ? "true" : undefined}
                className={`windows95-text block w-full px-2 py-1 text-left text-xs ${
                  index === mention.activeIndex ? "windows95-active" : ""
                }`}
                key={name}
                onMouseDown={(event) => {
                  // mousedown: the input keeps focus, a plain click would
                  // blur the popup before the mention lands in the draft.
                  event.preventDefault();
                  mention.apply(name);
                }}
                role="menuitem"
                type="button"
              >
                {name}
              </button>
            ))}
          </div>
        )}
        <form
          className="border-t-muted flex items-center gap-1 border-t p-1"
          onSubmit={(event) => {
            event.preventDefault();
            onSend();
          }}
        >
          <Input
            placeholder={t("lobby.chat.placeholder")}
            value={draft}
            onChange={(event) => {
              mention.reset();
              onDraftChange(event.target.value);
            }}
            onKeyDown={handleMentionKeyDown}
          />
          <Button
            aria-expanded={emojiOpen}
            aria-label={t("lobby.chat.emoji")}
            onClick={() => setEmojiOpen((open) => !open)}
            size="icon"
            title={t("lobby.chat.emoji")}
            type="button"
          >
            <Smile />
          </Button>
          {canAttach && (
            <Button
              disabled={attachPending}
              onClick={onAttach}
              title={t("lobby.chat.attach")}
              type="button"
            >
              {t("lobby.chat.attach")}
            </Button>
          )}
          <Button
            disabled={
              pending ||
              draft.trim().length === 0 ||
              countGraphemes(draft) > LOBBY_CHAT_MAX_GRAPHEMES
            }
            type="submit"
          >
            {t("lobby.chat.send")}
          </Button>
        </form>
      </div>
    </section>
  );
}
