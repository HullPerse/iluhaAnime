import { useI18n, type TranslationKey } from "@/lib/locale/i18n.utils";
import type { ChangelogEntry } from "@/types/settings";

export function ChangelogCategory({
  titleKey,
  entries,
}: {
  titleKey: TranslationKey;
  entries: ChangelogEntry[];
}) {
  const { t } = useI18n();
  if (entries.length === 0) return null;
  return (
    <div className="windows95-border bg-field flex flex-col p-1">
      <span className="windows95-text px-1 text-xs font-bold">{t(titleKey)}</span>
      <ul className="flex flex-col">
        {entries.map((entry) => (
          <li key={entry.key} className="windows95-text px-1 text-xs">
            - <span className="font-bold">[{t(`settings.changelog.scope.${entry.scope}`)}]:</span>{" "}
            {t(entry.key)}
          </li>
        ))}
      </ul>
    </div>
  );
}
