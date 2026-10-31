import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

import { CHANGELOG } from "@/config/system/changelog.config";
import { useI18n } from "@/hooks/i18n.hook";

import { ChangelogCategory } from "@/routes/components/settings/changelogCategory.settings";

export function SettingsChangelog() {
  const { t } = useI18n();
  const [latest] = CHANGELOG;
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    latest ? { [latest.version]: true } : {}
  );

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
              {expanded ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
              <span>{entry.version}</span>
            </button>
            {expanded && (
              <div className="flex flex-col gap-1 pt-1">
                <ChangelogCategory titleKey="settings.changelog.added" entries={entry.added} />
                <ChangelogCategory titleKey="settings.changelog.changed" entries={entry.changed} />
                <ChangelogCategory titleKey="settings.changelog.fixed" entries={entry.fixed} />
              </div>
            )}
          </div>
        );
      })}
      {CHANGELOG.length === 0 && (
        <span className="windows95-text text-hint px-1 text-xs">
          {t("settings.changelog.empty")}
        </span>
      )}
    </div>
  );
}
