import { KEYBINDS } from "@/config/player/keybinds.config";
import type { KeybindDef } from "@/config/player/keybinds.config";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { TranslationKey } from "@/types/i18n";

const CATEGORIES: KeybindDef["category"][] = [
  "playback",
  "navigation",
  "subtitles",
  "ui",
];

const CATEGORY_LABELS: Record<KeybindDef["category"], TranslationKey> = {
  playback: "player.media.cheatsheet.playback",
  navigation: "player.media.cheatsheet.navigation",
  subtitles: "player.media.cheatsheet.subtitles",
  ui: "player.media.cheatsheet.ui",
};

function Cheatsheet() {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-2">
      {CATEGORIES.map((category) => {
        const rows = KEYBINDS.filter((keybind) => keybind.category === category);
        if (rows.length === 0) return null;
        return (
          <div key={category} className="flex flex-col gap-0.5">
            <span className="text-hint text-xs font-bold tracking-wide uppercase">
              {t(CATEGORY_LABELS[category])}
            </span>
            {rows.map((keybind) => (
              <div
                key={`${keybind.action}-${keybind.keys}`}
                className="flex items-center justify-between gap-3"
              >
                <span className="windows95-border bg-field px-1 text-xs whitespace-nowrap">
                  {keybind.keys}
                </span>
                <span className="truncate text-xs">{t(keybind.description)}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export default Cheatsheet;
