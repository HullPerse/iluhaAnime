import { ChordChips } from "@/components/shared/keyboard/chord.keyboard.component";
import { KEYBIND_MANIFEST } from "@/config/system/manifest.config";
import { useI18n } from "@/hooks/i18n.hook";
import { humanizeChord } from "@/lib/core/chordHotkeys.utils";
import type { ResolvedKeybind } from "@/types/search/resolveHotkeys";

export function BindingCell({ row, scopeLabel }: { row: ResolvedKeybind; scopeLabel: string }) {
  const { t } = useI18n();
  if (row.shadowedChord) {
    const winner = KEYBIND_MANIFEST.find((entry) => entry.id === row.shadowedBy);
    return (
      <span className="flex w-60 min-w-0 shrink-0 items-center gap-1" role="cell">
        <span className="text-hint shrink-0 text-xs select-none">{scopeLabel}:</span>
        <s
          className="text-hint shrink-0 px-1 text-xs whitespace-nowrap select-none"
          title={
            winner ? t("settings.keybinds.shadowed", { name: t(winner.description) }) : undefined
          }
        >
          {humanizeChord(row.shadowedChord)}
        </s>
        {row.activeChord ? (
          <ChordChips chord={row.activeChord} />
        ) : (
          <span className="text-hint shrink-0 text-xs select-none">
            {t("settings.keybinds.unbound")}
          </span>
        )}
      </span>
    );
  }
  return (
    <span className="flex w-60 min-w-0 shrink-0 items-center gap-1" role="cell">
      <span className="text-hint shrink-0 text-xs select-none">{scopeLabel}:</span>
      {row.activeChord ? (
        <ChordChips chord={row.activeChord} />
      ) : (
        <span className="text-hint shrink-0 text-xs select-none">
          {t("settings.keybinds.unbound")}
        </span>
      )}
    </span>
  );
}
