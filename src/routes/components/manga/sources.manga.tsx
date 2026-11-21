import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getMangaSources, mangaSources, mangaSourcesKey, setMangaSource } from "@/api/manga.api";
import type { MangaSource } from "@/api/manga.api";
import { Settings } from "lucide-react";
import { memo, useState } from "react";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import { useI18n } from "@/hooks/i18n.hook";
import MangaSourceSettings from "@/routes/components/manga/sourceSettings.manga";
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

const MangaSourceRow = memo(
  ({
    source: { id, name, language },
    enabled,
    onSettings,
  }: {
    source: (typeof mangaSources)[number];
    enabled: boolean;
    onSettings: (source: MangaSource) => void;
  }) => {
    const { t } = useI18n();
    const client = useQueryClient();
    const settingsLabel = t("manga.sources.settings", { source: name });
    const change = useMutation({
      scope: { id: `manga-source:${id}` },
      mutationFn: (next: boolean) => setMangaSource(id, next),
      onSuccess: () => client.invalidateQueries({ queryKey: mangaSourcesKey }),
    });

    return (
      <li>
        <div className="hover:bg-field focus-within:bg-field flex items-center gap-1 pr-2">
          <label className="windows95-text flex min-h-10 min-w-0 flex-1 cursor-pointer items-center gap-2 px-2 py-1">
            <img
              src={`/images/manga-sources/${id}.png`}
              alt=""
              width={24}
              height={24}
              className="size-6 shrink-0"
            />
            <span className="min-w-0 flex-1 truncate font-bold">{name}</span>
            <span className="text-hint shrink-0">{language}</span>
            <Checkbox
              aria-label={name}
              checked={change.isPending ? change.variables : enabled}
              onChange={(next) => change.mutate(next)}
            />
          </label>
          <Button
            size="icon"
            className="size-6 shrink-0"
            title={settingsLabel}
            aria-label={settingsLabel}
            aria-haspopup="dialog"
            onClick={() => onSettings(id)}
          >
            <Settings className="size-3.5" aria-hidden />
          </Button>
        </div>
        {change.isError && <MangaState kind="error">{t("manga.sources.updateFailed")}</MangaState>}
      </li>
    );
  }
);
