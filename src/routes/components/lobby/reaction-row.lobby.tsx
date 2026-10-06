import { useState } from "react";
import { SmilePlus } from "lucide-react";

import { useI18n } from "@/hooks/i18n.hook";
import type { ReactionEntry } from "@/types/session";

export const REACTION_QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "🎉", "😢"] as const;

interface ReactionRowProps {
  messageId: string;
  entries: ReactionEntry[];
  /** null before the roster is known. */
  myPeerId: string | null;
  onReact: (input: { messageId: string; emoji: string; add: boolean }) => void;
}

// Requires `group` class for hover reveal.
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
