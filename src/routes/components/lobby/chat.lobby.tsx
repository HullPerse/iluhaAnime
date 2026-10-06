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
import { useAnimeMentionComposer } from "@/hooks/session/animeMention.hook";
import type { AnimeMentionComposer } from "@/hooks/session/animeMention.hook";
import { useMentionAutocomplete } from "@/hooks/session/mention.hook";
import type { MentionAutocomplete } from "@/hooks/session/mention.hook";
import { animeTitleFields, resolveAnimeTitle } from "@/lib/anilist/title.utils";
import {
  animeIdsFromLinks,
  animeIdsFromText,
  chatSegments,
  countGraphemes,
  formatChatClock,
  imagePreviewLinks,
} from "@/lib/session/chat.utils";
import { formatBytes } from "@/lib/utils/bytes.utils";
import AnimeCard from "./anime-card.lobby";
import AnimeOptionRow from "./anime-option.lobby";
import { ChatMessageText } from "./chat-message-text.lobby";
import ReactionRow from "./reaction-row.lobby";
import { useSettingsStore } from "@/store/settings.store";
import type { AniMedia, AniTitleLanguage } from "@/types/anilist";
import type {
  ChatMessage,
  PinnedMessage,
  ReactionEntry,
} from "@/types/session";

const NEAR_BOTTOM_PX = 32;

const ANIME_CARD_MAX = 4;

// Stable refs avoid memo rerenders.
const NO_NAMES: string[] = [];
const NO_REACTIONS: ReactionEntry[] = [];

function replySnippet(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 60 ? `${flat.slice(0, 57)}…` : flat;
}

const EmojiPanel = lazy(() => import("./emoji.lobby"));

type OnReact = (input: { messageId: string; emoji: string; add: boolean }) => void;

const NOOP_ON_REACT: OnReact = () => undefined;

interface PinBannerProps {
  pinned: PinnedMessage;
  pinnedMessage: ChatMessage | null;
  pinnedByName: string;
  canPin: boolean;
  onPin?: (messageId: string | null) => void;
  onJump: (messageId: string) => void;
}

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
  quoted: ChatMessage | null;
  attachBusy: boolean;
  attachFailed: boolean;
  imagePreviews: boolean;
  customEmoji: ReadonlyMap<string, string>;
  mentionNames: string[];
  canPin: boolean;
  reactions: ReactionEntry[];
  myPeerId: string | null;
  onTorrentLink: (token: string) => void;
  onDownloadAttachment: (messageId: string) => void;
  onReplyChange?: (id: string | null) => void;
  onPin?: (messageId: string | null) => void;
  onReact: OnReact;
  onJump: (messageId: string) => void;
}

// Requires `group` class for hover reveals.
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
  const animeIds = useMemo(() => {
    const ids = [...animeIdsFromLinks(message.links), ...animeIdsFromText(message.text)];
    return ids
      .filter((id, index) => ids.indexOf(id) === index)
      .slice(0, ANIME_CARD_MAX);
  }, [message.links, message.text]);
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
      {animeIds.map((animeId) => (
        <AnimeCard animeId={animeId} key={animeId} />
      ))}
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
  target: ChatMessage | null;
  onJump: (messageId: string) => void;
  onReplyChange?: (id: string | null) => void;
}

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
  names: string[];
}

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
  onJump: () => void;
}

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

// Shrinks never count as arrivals.
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
            // Keeps focus so the mention lands before blur.
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

interface AnimeMenuProps {
  options: AniMedia[];
  activeIndex: number;
  preference: AniTitleLanguage | null;
  onPick: (brief: AniMedia) => void;
}

function AnimeMenu({ options, activeIndex, preference, onPick }: AnimeMenuProps) {
  const { t } = useI18n();
  if (options.length === 0) return null;
  return (
    <div
      aria-label={t("lobby.chat.anime.option.menu")}
      className="ui-panel absolute bottom-full left-1 z-20 mb-1 w-64 p-1"
      role="listbox"
    >
      {options.map((brief, index) => (
        <AnimeOptionRow
          brief={brief}
          highlighted={index === activeIndex}
          key={brief.id}
          onPick={() => onPick(brief)}
          title={
            resolveAnimeTitle(animeTitleFields(brief), preference) || brief.title
          }
        />
      ))}
    </div>
  );
}

interface AnimePreviewBarProps {
  brief: AniMedia;
  title: string;
  onClear: () => void;
}

function AnimePreviewBar({ brief, title, onClear }: AnimePreviewBarProps) {
  const { t } = useI18n();
  return (
    <div className="bg-field windows95-3d-border mx-1 mb-1 flex items-center gap-1 px-2 py-1">
      <span className="windows95-text text-hint shrink-0 text-xs">
        {t("lobby.chat.anime.selected")}
      </span>
      {brief.cover_url !== null && brief.cover_url !== "" && (
        <img
          alt=""
          className="h-6 w-4 shrink-0 border border-muted object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          src={brief.cover_url}
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      )}
      <span className="windows95-text text-text min-w-0 flex-1 truncate text-xs">
        {title}
      </span>
      <Button
        aria-label={t("lobby.chat.anime.clear")}
        onClick={onClear}
        size="icon"
        title={t("lobby.chat.anime.clear")}
        type="button"
      >
        <X />
      </Button>
    </div>
  );
}

interface EmojiPopoverProps {
  open: boolean;
  onPick: (emoji: string) => void;
}

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

interface ChatComposerProps {
  draft: string;
  pending: boolean;
  canAttach: boolean;
  attachPending: boolean;
  emojiOpen: boolean;
  emojiRef: RefObject<HTMLDivElement | null>;
  mention: MentionAutocomplete;
  anime: AnimeMentionComposer;
  onDraftChange: (value: string) => void;
  onSend: (animeId: number | null) => void;
  onAttach: () => void;
  onToggleEmoji: () => void;
  onEmojiPick: (emoji: string) => void;
}

function ChatComposer({
  draft,
  pending,
  canAttach,
  attachPending,
  emojiOpen,
  emojiRef,
  mention,
  anime,
  onDraftChange,
  onSend,
  onAttach,
  onToggleEmoji,
  onEmojiPick,
}: ChatComposerProps) {
  const { t } = useI18n();
  return (
    <>
      {anime.error && (
        <p className="windows95-text text-hint px-1 text-xs italic">
          {t("lobby.chat.anime.searchError")}
        </p>
      )}
      {anime.picked !== null && (
        <AnimePreviewBar
          brief={anime.picked}
          onClear={anime.handleClear}
          title={
            resolveAnimeTitle(animeTitleFields(anime.picked), anime.preference) ||
            anime.picked.title
          }
        />
      )}
      <div ref={emojiRef} className="relative">
        <EmojiPopover open={emojiOpen} onPick={onEmojiPick} />
        {anime.open ? (
          <AnimeMenu
            activeIndex={anime.activeIndex}
            onPick={anime.handlePick}
            options={anime.options}
            preference={anime.preference}
          />
        ) : (
          <MentionMenu mention={mention} />
        )}
        <form
          className="border-t-muted flex items-center gap-1 border-t p-1"
          onSubmit={(event) => {
            event.preventDefault();
            onSend(anime.picked?.id ?? null);
          }}
        >
          <Input
            placeholder={t("lobby.chat.placeholder")}
            value={draft}
            onChange={(event) => {
              mention.reset();
              // Edit clears pick.
              anime.resetHighlight();
              anime.handleClear();
              onDraftChange(event.target.value);
            }}
            onKeyDown={anime.handleKeyDown}
          />
          <Button
            aria-expanded={emojiOpen}
            aria-label={t("lobby.chat.emoji")}
            onClick={onToggleEmoji}
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
    </>
  );
}

interface ChatLobbyProps {
  messages: ChatMessage[];
  draft: string;
  pending: boolean;
  canAttach: boolean;
  attachPending?: boolean;
  fetchingAttachment?: string | null;
  failedAttachment?: string | null;
  onDraftChange: (value: string) => void;
  onSend: (animeId: number | null) => void;
  replyTo?: string | null;
  onReplyChange?: (id: string | null) => void;
  onTorrentLink: (token: string) => void;
  onAttach: () => void;
  onDownloadAttachment: (messageId: string) => void;
  typingNames?: string[];
  mentionNames?: string[];
  pinned?: PinnedMessage | null;
  pinnedByName?: string;
  reactions?: ReactionEntry[];
  myPeerId?: string | null;
  canPin?: boolean;
  onPin?: (messageId: string | null) => void;
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
  const { open: emojiOpen, ref: emojiRef, toggle: handleEmojiToggle } =
    useChatEmojiPicker();
  const replyTarget = useMemo(
    () =>
      replyTo !== null ? (messages.find((m) => m.id === replyTo) ?? null) : null,
    [replyTo, messages],
  );
  const messagesById = useMemo(
    () => new Map(messages.map((message) => [message.id, message])),
    [messages],
  );

  const reactionsByMessage = useMemo(() => {
    const byMessage = new Map<string, ReactionEntry[]>();
    for (const entry of reactions) {
      const list = byMessage.get(entry.messageId) ?? [];
      list.push(entry);
      byMessage.set(entry.messageId, list);
    }
    return byMessage;
  }, [reactions]);

  const pinnedMessage = useMemo(
    () =>
      pinned !== null ? (messagesById.get(pinned.messageId) ?? null) : null,
    [pinned, messagesById],
  );

  const mention = useMentionAutocomplete(draft, mentionNames, onDraftChange);
  const anime = useAnimeMentionComposer(draft, onDraftChange, mention.onKeyDown);

  const { unread, handleScroll, jumpToLatest } = useChatScrollFollow(
    scrollRef,
    bottomRef,
    count,
  );

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
      <ChatComposer
        anime={anime}
        attachPending={attachPending}
        canAttach={canAttach}
        draft={draft}
        emojiOpen={emojiOpen}
        emojiRef={emojiRef}
        mention={mention}
        onAttach={onAttach}
        onDraftChange={onDraftChange}
        onEmojiPick={handleEmojiPick}
        onSend={onSend}
        onToggleEmoji={handleEmojiToggle}
        pending={pending}
      />
    </section>
  );
}
