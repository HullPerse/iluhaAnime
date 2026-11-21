import { useCell } from "@hullperse/hp_utils/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { reportBackgroundError } from "@hullperse/hp_utils/attempt";
import { ExternalLink } from "lucide-react";

import type { MangaSource } from "@/api/manga.api";
import { testMangaSourceProxy } from "@/api/manga.api";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import { useI18n } from "@/hooks/i18n.hook";
import { useOnlineStatus } from "@/hooks/network.hook";
import { effectiveProxyUrl } from "@/lib/core/system/proxy.utils";
import { mangaSourceOrigin } from "@/lib/manga/sourcePage.utils";
import MangaLibDomains from "@/routes/components/manga/domains.manga";
import { ProxyField } from "@/routes/components/settings/proxy/proxyField.settings";
import { patchSettings, settingsAtoms } from "@/store/settings.store";

export default function MangaSourceSettings({
  source,
  name,
  onClose,
}: {
  source: MangaSource;
  name: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const domain = useCell(settingsAtoms.mangaLibBrowserDomain);
  const globalProxy = useCell(settingsAtoms.mangaProxyUrl);
  const overrides = useCell(settingsAtoms.mangaSourceProxies);
  const nsfwBySource = useCell(settingsAtoms.mangaSourceNsfw);
  const isOnline = useOnlineStatus();
  const proxy = overrides[source] || null;
  const showNsfw = nsfwBySource[source] === true;

  const setNsfw = (enabled: boolean) => {
    patchSettings({ mangaSourceNsfw: { ...nsfwBySource, [source]: enabled } });
  };

  const openWebsite = () => {
    openUrl(mangaSourceOrigin(source, domain)).catch((error: unknown) =>
      reportBackgroundError("manga.source-home", error)
    );
  };

  const setProxy = (next: string | null) => {
    const nextProxies = { ...overrides };
    if (next === null) delete nextProxies[source];
    else nextProxies[source] = next;
    patchSettings({ mangaSourceProxies: nextProxies });
  };

  return (
    <Modal
      header={t("manga.sources.settings", { source: name })}
      onClose={onClose}
      headerActions={
        <Button
          size="icon"
          className="size-5"
          title={t("manga.sources.openWebsite")}
          aria-label={t("manga.sources.openWebsite")}
          onClick={openWebsite}
        >
          <ExternalLink className="size-2.5" aria-hidden />
        </Button>
      }
      className="w-md max-w-[94%]"
    >
      <div className="windows95-text grid gap-2">
        <ProxyField
          label={t("settings.manga.proxy.override", { source: name })}
          value={proxy}
          onChange={setProxy}
          placeholder={t("settings.manga.proxy.inherit")}
          stacked
          test={() => testMangaSourceProxy(source, effectiveProxyUrl(proxy, globalProxy) ?? "")}
          testDisabled={!isOnline}
        />
        <label className="windows95-text flex cursor-pointer items-center gap-1.5 select-none">
          <Checkbox aria-label={t("manga.sources.nsfw")} checked={showNsfw} onChange={setNsfw} />
          {t("manga.sources.nsfw")}
        </label>
        {source === "mangalib" && <MangaLibDomains />}
      </div>
    </Modal>
  );
}
