import { EmojiPicker } from "@ferrucc-io/emoji-picker";

import { useCustomEmoji } from "@/hooks/emoji.hook";
import { useI18n } from "@/hooks/i18n.hook";

interface EmojiLobbyProps {
  onPick: (emoji: string) => void;
}

/**
 * Win95-styled, lazily loaded wrapper around @ferrucc-io/emoji-picker.
 * Lazy-loaded from chat.lobby so the emoji data bundle stays out of the
 * initial chunk and loads on the first picker open. The custom `iluha_*`
 * section only appears when such files exist in `<app data>/emoji`.
 */
export default function EmojiLobby({ onPick }: EmojiLobbyProps) {
  const { t } = useI18n();
  const customEmoji = useCustomEmoji();

  const customSections =
    customEmoji.size === 0
      ? undefined
      : [
          {
            id: "iluha",
            name: t("lobby.chat.emoji.custom"),
            emojis: [...customEmoji].map(([name, imageUrl]) => ({
              id: name,
              imageUrl,
              name,
            })),
          },
        ];

  return (
    <EmojiPicker
      className="windows95-text w-[300px]"
      customSections={customSections}
      emojiSize={22}
      emojisPerRow={8}
      onEmojiSelect={onPick}
    >
      <EmojiPicker.Header>
        <EmojiPicker.Input placeholder={t("lobby.chat.emoji.search")} />
      </EmojiPicker.Header>
      <EmojiPicker.Group>
        <EmojiPicker.List containerHeight={240} />
      </EmojiPicker.Group>
    </EmojiPicker>
  );
}
