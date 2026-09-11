import { useState } from "react";

import { CHANGELOG } from "@/config/settings/changelog.config";
import { useI18n, type TranslationKey } from "@/lib/locale/i18n.utils";
import type { ChangelogEntry } from "@/types/settings";

export function SettingsChangelog() {
  const { t } = useI18n();
  const [open, setOpen] = useState<Record<string, boolean>>({ "4.0.4": true });
  return (
    <div className="flex flex-col gap-1">
      {CHANGELOG.map((entry) => {
        const expanded = open[entry.version] ?? false;
        return (
          <div key={entry.version} className="ui-panel flex flex-col p-1">
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setOpen((state) => ({ ...state, [entry.version]: !expanded }))}
              className="windows95-text flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 px-1 text-left text-xs font-bold"
            >
              {expanded ? "▼" : "▶"} <span>{entry.version}</span>
            </button>
            {expanded ? (
              <div className="flex flex-col gap-1 pt-1">
                <ChangelogCategory titleKey="settings.changelog.added" entries={entry.added} />
                <ChangelogCategory titleKey="settings.changelog.changed" entries={entry.changed} />
                <ChangelogCategory titleKey="settings.changelog.fixed" entries={entry.fixed} />
              </div>
            ) : null}
          </div>
        );
      })}
      {CHANGELOG.length === 0 ? (
        <span className="windows95-text text-hint px-1 text-xs">
          {t("settings.changelog.empty")}
        </span>
      ) : null}
    </div>
  );
}

function ChangelogCategory({
  titleKey,
  entries,
}: {
  titleKey: TranslationKey;
  entries: ChangelogEntry[];
}) {
  const { t } = useI18n();
  if (entries.length === 0) return null;
  return (
    <div className="windows95-border flex flex-col bg-white p-1">
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
