import { useState } from "react";
import { SmilePlus } from "lucide-react";

import { useI18n } from "@/hooks/i18n.hook";
import type { ReactionEntry } from "@/types/session";

/**
 * A small fixed set of quick reactions; the per-message cap of 5 kinds is
 * enforced host-side, so a pick past the cap is refused with a toast.
 */
export const REACTION_QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "🎉", "😢"] as const;

interface ReactionRowProps {
  messageId: string;
  /** The reaction entries that belong to this message. */
  entries: ReactionEntry[];
  /** This instance's own peer id (`null` before the roster is known). */
  myPeerId: string | null;
  /** Toggles a reaction on or off; the host validates and broadcasts. */
  onReact: (input: { messageId: string; emoji: string; add: boolean }) => void;
}

/**
 * Reaction row under one chat line: a pill per emoji (count of reacting
 * peers) plus a hover-only "+" that opens a quick row for a new emoji.
 * The line itself must carry the `group` class for the hover reveal.
 */
export default function ReactionRow({
  messageId,
  entries,
  myPeerId,
  onReact,
}: ReactionRowProps) {
  const { t } = useI18n();
  const [adding, setAdding] = useState(false);

  const pick = (emoji: string) => {
    onReact({ messageId, emoji, add: true });
    setAdding(false);
  };

  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-1">
      {entries.map((entry) => {
        const mine = myPeerId !== null && entry.peers.includes(myPeerId);
        return (
          <button
            aria-pressed={mine}
            className={`bg-field windows95-3d-border px-1 py-0.5 text-xs ${
              mine ? "windows95-active" : ""
            }`}
            key={entry.emoji}
            onClick={() => onReact({ messageId, emoji: entry.emoji, add: !mine })}
            title={t("lobby.chat.reaction.count", { count: entry.peers.length })}
            type="button"
          >
            <span className="text-text">{entry.emoji}</span>
            <span className="text-hint"> {entry.peers.length}</span>
          </button>
        );
      })}
      <button
        aria-expanded={adding}
        aria-label={t("lobby.chat.reaction.add")}
        className="group-focus-within:opacity-100 group-hover:opacity-100 ml-1 inline-flex size-4 items-center justify-center border border-muted bg-field opacity-0"
        onClick={() => setAdding((open) => !open)}
        title={t("lobby.chat.reaction.add")}
        type="button"
      >
        <SmilePlus className="text-hint size-3" />
      </button>
      {adding && (
        <div className="bg-field windows95-3d-border flex items-center gap-0.5 px-1 py-0.5">
          {REACTION_QUICK_EMOJIS.map((emoji) => (
            <button
              className="text-text px-0.5 text-sm"
              key={emoji}
              onClick={() => pick(emoji)}
              title={emoji}
              type="button"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
