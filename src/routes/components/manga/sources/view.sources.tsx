import { useQuery } from "@tanstack/react-query";

import { getMangaSources, mangaSources, mangaSourcesKey } from "@/api/manga.api";
import type { MangaSource } from "@/api/manga.api";
import { useState } from "react";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { MangaSourceRow } from "@/routes/components/manga/sources/row.sources";
import MangaSourceSettings from "@/routes/components/manga/sources/settings.sources";
import { MangaState } from "@/routes/components/manga/state.manga";

export default function MangaSources() {
  const { t } = useI18n();
  const sources = useQuery({ queryKey: mangaSourcesKey, queryFn: getMangaSources });
  const { data } = sources;
  const [settingsSource, setSettingsSource] = useState<MangaSource | null>(null);
  const selected = mangaSources.find(({ id }) => id === settingsSource);

  return (
    <div className="flex flex-col gap-3 text-xs">
      {sources.isPending && <MangaState kind="loading">{t("manga.library.loading")}</MangaState>}
      {sources.isError && (
        <MangaState kind="error">
          {t("manga.sources.loadFailed")}
          <Button onClick={async () => sources.refetch()}>{t("manga.search.retry")}</Button>
        </MangaState>
      )}
      {data && (
        <section className="ui-panel min-w-0" aria-labelledby="manga-sources-catalogues">
          <h2 id="manga-sources-catalogues" className="ui-titlebar">
            {t("manga.sources.catalogues")}
          </h2>
          <ul className="divide-muted flex flex-col divide-y">
            {mangaSources.map((source) => (
              <MangaSourceRow
                key={source.id}
                source={source}
                onSettings={setSettingsSource}
                enabled={data.some((row) => row.id === source.id && row.enabled)}
              />
            ))}
          </ul>
        </section>
      )}
      {selected && (
        <MangaSourceSettings
          source={selected.id}
          name={selected.name}
          onClose={() => setSettingsSource(null)}
        />
      )}
    </div>
  );
}
