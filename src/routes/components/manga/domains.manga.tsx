import { useCell } from "@hullperse/hp_utils/react";

import Select from "@/components/ui/select.component";
import { useI18n } from "@/hooks/i18n.hook";
import { patchSettings, settingsAtoms } from "@/store/settings.store";
import type { MangaLibDomain } from "@/types/ui/settings";

const DOMAIN_OPTIONS: { value: MangaLibDomain; label: string }[] = [
  { value: "mangalib.me", label: "mangalib.me" },
  { value: "mangalib.org", label: "mangalib.org" },
];

export default function MangaLibDomains() {
  const { t } = useI18n();
  const requestDomain = useCell(settingsAtoms.mangaLibRequestDomain);
  const browserDomain = useCell(settingsAtoms.mangaLibBrowserDomain);

  return (
    <fieldset className="windows95-border m-0 grid min-w-0 gap-2 p-2">
      <legend className="windows95-text px-1 font-bold">{t("settings.manga.domains.title")}</legend>
      <div className="grid items-center gap-1 sm:grid-cols-[minmax(8rem,1fr)_minmax(8rem,1fr)]">
        <span>{t("settings.manga.domains.requests")}</span>
        <Select
          label={t("settings.manga.domains.requests")}
          value={requestDomain}
          options={DOMAIN_OPTIONS}
          onChange={(domain) => patchSettings({ mangaLibRequestDomain: domain })}
        />
      </div>
      <div className="grid items-center gap-1 sm:grid-cols-[minmax(8rem,1fr)_minmax(8rem,1fr)]">
        <span>{t("settings.manga.domains.browser")}</span>
        <Select
          label={t("settings.manga.domains.browser")}
          value={browserDomain}
          options={DOMAIN_OPTIONS}
          onChange={(domain) => patchSettings({ mangaLibBrowserDomain: domain })}
        />
      </div>
    </fieldset>
  );
}
