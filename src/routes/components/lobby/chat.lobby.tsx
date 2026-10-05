import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { RefObject } from "react";
import {
  AlertTriangle,
  Download,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Pin,
  PinOff,
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
import type { MentionAutocomplete } from "@/hooks/session/mention.hook";
import {
  chatSegments,
  countGraphemes,
  formatChatClock,
  imagePreviewLinks,
} from "@/lib/session/chat.utils";
import { formatBytes } from "@/lib/utils/bytes.utils";
import { ChatMessageText } from "./chat-message-text.lobby";
import ReactionRow from "./reaction-row.lobby";
import { useSettingsStore } from "@/store/settings.store";
import type {
  ChatMessage,
  PinnedMessage,
  ReactionEntry,
} from "@/types/session";

/** How close to the bottom (px) still counts as "following" the chat. */
const NEAR_BOTTOM_PX = 32;

/**
 * Stable empty defaults: a fresh `[]` on every render would rerender the memo
 * consumers that list the prop in their dependency array.
 */
const NO_NAMES: string[] = [];
const NO_REACTIONS: ReactionEntry[] = [];

/** One line, bounded — the quote shown above a reply and in the composer bar. */
function replySnippet(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 60 ? `${flat.slice(0, 57)}…` : flat;
}

/** Lazy: the emoji data bundle loads only on the first picker open. */
const EmojiPanel = lazy(() => import("./emoji.lobby"));

/** Add or remove a reaction on one message. */
type OnReact = (input: { messageId: string; emoji: string; add: boolean }) => void;

/** A stable no-op for rooms that don't provide a reaction handler. */
const NOOP_ON_REACT: OnReact = () => undefined;

interface PinBannerProps {
  pinned: PinnedMessage;
  /** The pinned line, if its anchor is still in the rendered history. */
  pinnedMessage: ChatMessage | null;
  /** The pinner's display name (the raw peer id is the fallback). */
  pinnedByName: string;
  canPin: boolean;
  /** Pin (`id`) or unpin (`null`) the room's single message. */
  onPin?: (messageId: string | null) => void;
  /** Centers the pinned line in the history. */
  onJump: (messageId: string) => void;
}

/**
 * The room's single pinned message, shown as a fixed strip between the
 * titlebar and the scroll area. Clicking the snippet jumps to the anchor.
 */
function PinBanner({
  pinned,
  pinnedMessage,
  pinnedByName,
  canPin,
  onPin,
  onJump,
}: PinBannerProps) {
  const { t } = useI18n();
  return (
    <div className="bg-field windows95-3d-border mx-1 mt-1 flex items-center gap-1.5 px-2 py-1">
      <Pin className="text-highlight size-3.5 shrink-0" />
      <button
        aria-label={t("lobby.chat.pin.jump")}
        className="windows95-text text-text min-w-0 flex-1 text-left text-xs"
        onClick={() => onJump(pinned.messageId)}
        title={t("lobby.chat.pin.jump")}
        type="button"
      >
        <span className="text-hint">
          {t("lobby.chat.pin.by", {
            name: pinnedByName || pinned.pinnedBy,
          })}{" "}
        </span>
        <span>
          {pinnedMessage !== null
            ? replySnippet(pinnedMessage.text)
            : t("lobby.chat.pin.unavailable")}
        </span>
      </button>
      {canPin && (
        <Button
          aria-label={t("lobby.chat.pin.unpin")}
          onClick={() => onPin?.(null)}
          size="icon"
          title={t("lobby.chat.pin.unpin")}
          type="button"
        >
          <PinOff />
        </Button>
      )}
    </div>
  );
}

interface ChatLineProps {
  message: ChatMessage;
  /** The line the reply quote points at, when its target is still in history. */
  quoted: ChatMessage | null;
  /** The `.torrent` attachment fetch is in flight / failed for this line. */
  attachBusy: boolean;
  attachFailed: boolean;
  imagePreviews: boolean;
  customEmoji: ReadonlyMap<string, string>;
  /** Roster display names used to detect and highlight `@mentions`. */
  mentionNames: string[];
  canPin: boolean;
  /** This line's reaction entries, pre-grouped by the parent. */
  reactions: ReactionEntry[];
  myPeerId: string | null;
  onTorrentLink: (token: string) => void;
  onDownloadAttachment: (messageId: string) => void;
  onReplyChange?: (id: string | null) => void;
  onPin?: (messageId: string | null) => void;
  onReact: OnReact;
  /** Centers a line by id (the reply quote jump). */
  onJump: (messageId: string) => void;
}

/**
 * A single chat line: reply quote, timestamped body, hover actions, optional
 * `.torrent` card, image previews and the reaction row. The line carries the
 * `group` class the hover-only reveals depend on.
 */
function ChatLine({
  message,
  quoted,
  attachBusy,
  attachFailed,
  imagePreviews,
  customEmoji,
  mentionNames,
  canPin,
  reactions,
  myPeerId,
  onTorrentLink,
  onDownloadAttachment,
  onReplyChange,
  onPin,
  onReact,
  onJump,
}: ChatLineProps) {
  const { t } = useI18n();
  const attachLabel = attachBusy
    ? t("lobby.chat.attachment.loading")
    : attachFailed
      ? t("lobby.chat.attachment.retry")
      : t("lobby.chat.attachment.download");
  const replyId = message.replyTo ?? null;
  return (
    <li
      className="group windows95-text text-xs whitespace-pre-wrap"
      data-message-id={message.id || undefined}
    >
      {replyId !== null && (
        <button
          aria-label={t("lobby.chat.reply.jump")}
          className="text-hint mb-0.5 flex w-full min-w-0 items-center gap-1 text-left"
          onClick={() => onJump(replyId)}
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
        <ChatMessageText
          customEmoji={customEmoji}
          onTorrentLink={onTorrentLink}
          segments={chatSegments(message.text, mentionNames)}
        />
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
      {canPin && (
        <button
          aria-label={t("lobby.chat.pin")}
          className="group-focus-within:opacity-100 group-hover:opacity-100 ml-1 inline-flex size-3.5 align-middle opacity-0"
          onClick={() => onPin?.(message.id)}
          title={t("lobby.chat.pin")}
          type="button"
        >
          <Pin className="size-3.5" />
        </button>
      )}
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
      <ReactionRow
        entries={reactions}
        messageId={message.id}
        myPeerId={myPeerId}
        onReact={onReact}
      />
    </li>
  );
}

interface ReplyBarProps {
  /** The composer's reply target when it is still in the rendered history. */
  target: ChatMessage | null;
  onJump: (messageId: string) => void;
  onReplyChange?: (id: string | null) => void;
}

/** The "replying to" preview bar above the composer, with its cancel button. */
function ReplyBar({ target, onJump, onReplyChange }: ReplyBarProps) {
  const { t } = useI18n();
  return (
    <div className="bg-field windows95-3d-border mx-1 mb-1 flex items-center gap-1 px-2 py-1">
      <Reply className="text-highlight size-3 shrink-0" />
      <button
        className="windows95-text text-hint min-w-0 flex-1 truncate text-left text-xs"
        onClick={() => target !== null && onJump(target.id)}
        title={t("lobby.chat.reply.jump")}
        type="button"
      >
        {target !== null
          ? t("lobby.chat.replyingTo", {
              from: target.from,
              snippet: replySnippet(target.text),
            })
          : t("lobby.chat.reply.unavailable")}
      </button>
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
  );
}

interface TypingLineProps {
  /** Peers currently typing, as display names. */
  names: string[];
}

/** The italic "N are typing" line above the composer. */
function TypingLine({ names }: TypingLineProps) {
  const { t } = useI18n();
  return (
    <p className="windows95-text text-hint px-1 text-xs italic">
      {names.length === 1
        ? t("lobby.chat.typing.one", { name: names[0] })
        : t("lobby.chat.typing.many", { names: names.join(", ") })}
    </p>
  );
}

interface UnreadPillProps {
  count: number;
  /** Follows the chat to the newest lines and clears the counter. */
  onJump: () => void;
}

/** The sticky "N new" pill, shown while the reader is not at the bottom. */
function UnreadPill({ count, onJump }: UnreadPillProps) {
  const { t } = useI18n();
  return (
    <button
      className="windows95-text text-highlight sticky bottom-0 left-1/2 mx-auto block w-fit -translate-x-1/2 border border-muted bg-background px-2 py-0.5 text-xs font-bold"
      onClick={onJump}
      type="button"
    >
      {t("lobby.chat.new", { count })}
    </button>
  );
}

/**
 * Follows the chat while the reader is at the bottom; otherwise counts
 * arrivals for the "N new" pill. Shrinks (history trim, optimistic-echo
 * reconciliation) never count as arrivals.
 */
function useChatScrollFollow(
  scrollRef: RefObject<HTMLDivElement | null>,
  bottomRef: RefObject<HTMLDivElement | null>,
  messageCount: number,
) {
  const [unread, setUnread] = useState(0);
  const followRef = useRef(true);
  const prevCountRef = useRef(0);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView?.({ block: "end" });
  }, [bottomRef]);

  useEffect(() => {
    const delta = messageCount - prevCountRef.current;
    prevCountRef.current = messageCount;
    if (messageCount === 0 || delta <= 0) return;
    if (followRef.current) {
      scrollToBottom();
      setUnread(0);
    } else {
      setUnread((value) => value + delta);
    }
  }, [messageCount, scrollToBottom]);

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

  return { handleScroll, jumpToLatest, unread };
}

/**
 * Lazy emoji picker state: open flag, anchor ref, and close-on-outside-click
 * / Escape behavior.
 */
function useChatEmojiPicker() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const toggle = () => setOpen((value) => !value);

  return { open, ref, toggle };
}

interface MentionMenuProps {
  mention: MentionAutocomplete;
}

/** The `@` autocomplete dropdown above the composer input. */
function MentionMenu({ mention }: MentionMenuProps) {
  const { t } = useI18n();
  if (!mention.open) return null;
  return (
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
  );
}

interface EmojiPopoverProps {
  open: boolean;
  onPick: (emoji: string) => void;
}

/** The floating, lazy-loaded emoji panel. */
function EmojiPopover({ open, onPick }: EmojiPopoverProps) {
  const { t } = useI18n();
  if (!open) return null;
  return (
    <div className="absolute bottom-full left-1 z-20 mb-1">
      <div className="ui-panel p-1">
        <Suspense
          fallback={
            <p className="windows95-text text-hint p-3 text-xs">
              {t("lobby.chat.emoji.loading")}
            </p>
          }
        >
          <EmojiPanel onPick={onPick} />
        </Suspense>
      </div>
    </div>
  );
}

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
  /** The room's single pinned anchor (`null` = nothing pinned). */
  pinned?: PinnedMessage | null;
  /** The pinner's display name (resolved by the parent; the raw peer id is the fallback). */
  pinnedByName?: string;
  /** Flat reaction entries for every chat message. */
  reactions?: ReactionEntry[];
  /** This instance's own peer id (highlights "you reacted"). */
  myPeerId?: string | null;
  /** Host + moderators may pin/unpin (the same set as `canAttach`). */
  canPin?: boolean;
  /** Pin (`id`) or unpin (`null`) the room's single message. */
  onPin?: (messageId: string | null) => void;
  /** Add or remove a reaction on one message. */
  onReact?: (input: { messageId: string; emoji: string; add: boolean }) => void;
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
  typingNames = NO_NAMES,
  mentionNames = NO_NAMES,
  pinned = null,
  pinnedByName = "",
  reactions = NO_REACTIONS,
  myPeerId = null,
  canPin = false,
  onPin,
  onReact,
}: ChatLobbyProps) {
  const { t } = useI18n();
  const customEmoji = useCustomEmoji();
  const imagePreviews = useSettingsStore((state) => state.chatImagePreviews);
  const patch = useSettingsStore((state) => state.patch);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const count = messages.length;
  const { open: emojiOpen, ref: emojiRef, toggle: toggleEmoji } =
    useChatEmojiPicker();
  // Reply: resolve the composer target for its preview bar and index messages
  // so each quote line can look up what it points at (O(1), not a find-in-map).
  const replyTarget = useMemo(
    () =>
      replyTo !== null ? (messages.find((m) => m.id === replyTo) ?? null) : null,
    [replyTo, messages],
  );
  const messagesById = useMemo(
    () => new Map(messages.map((message) => [message.id, message])),
    [messages],
  );

  // Reactions grouped by message id: each line looks up its pills in O(1).
  const reactionsByMessage = useMemo(() => {
    const byMessage = new Map<string, ReactionEntry[]>();
    for (const entry of reactions) {
      const list = byMessage.get(entry.messageId) ?? [];
      list.push(entry);
      byMessage.set(entry.messageId, list);
    }
    return byMessage;
  }, [reactions]);

  // The pinned line when its anchor is still in the rendered history.
  const pinnedMessage = useMemo(
    () =>
      pinned !== null ? (messagesById.get(pinned.messageId) ?? null) : null,
    [pinned, messagesById],
  );

  // @mention autocomplete lives in its own hook: query detection, menu state,
  // keyboard navigation and draft rewriting (lobby.md §14 chat).
  const mention = useMentionAutocomplete(draft, mentionNames, onDraftChange);
  const handleMentionKeyDown = mention.onKeyDown;

  const { unread, handleScroll, jumpToLatest } = useChatScrollFollow(
    scrollRef,
    bottomRef,
    count,
  );

  // Reply navigation: center the row a quote points at (ids are ascii
  // alnum/-/_ only, so the selector is always safe).
  const scrollToMessage = (id: string) => {
    const element = scrollRef.current?.querySelector(
      `[data-message-id="${id}"]`
    );
    element?.scrollIntoView?.({ block: "center" });
  };

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
      {pinned !== null && (
        <PinBanner
          canPin={canPin}
          onJump={scrollToMessage}
          onPin={onPin}
          pinned={pinned}
          pinnedByName={pinnedByName}
          pinnedMessage={pinnedMessage}
        />
      )}
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
              const replyId = message.replyTo ?? null;
              const quoted =
                replyId !== null ? (messagesById.get(replyId) ?? null) : null;
              return (
                <ChatLine
                  attachBusy={fetchingAttachment === message.id}
                  attachFailed={failedAttachment === message.id}
                  canPin={canPin}
                  customEmoji={customEmoji}
                  imagePreviews={imagePreviews}
                  key={message.id || `${message.at}-${index}`}
                  message={message}
                  mentionNames={mentionNames}
                  myPeerId={myPeerId}
                  onDownloadAttachment={onDownloadAttachment}
                  onJump={scrollToMessage}
                  onPin={onPin}
                  onReact={onReact ?? NOOP_ON_REACT}
                  onReplyChange={onReplyChange}
                  onTorrentLink={onTorrentLink}
                  quoted={quoted}
                  reactions={reactionsByMessage.get(message.id) ?? NO_REACTIONS}
                />
              );
            })}
          </ul>
        )}
        <div ref={bottomRef} />
        {unread > 0 && <UnreadPill count={unread} onJump={jumpToLatest} />}
      </div>
      {typingNames.length > 0 && <TypingLine names={typingNames} />}
      {replyTo !== null && (
        <ReplyBar onJump={scrollToMessage} onReplyChange={onReplyChange} target={replyTarget} />
      )}
      <div ref={emojiRef} className="relative">
        <EmojiPopover open={emojiOpen} onPick={handleEmojiPick} />
        <MentionMenu mention={mention} />
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
            onClick={toggleEmoji}
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
