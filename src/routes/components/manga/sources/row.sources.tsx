import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Settings } from "lucide-react";
import { memo } from "react";

import { mangaSourcesKey, setMangaSource } from "@/api/manga.api";
import type { MangaSource, mangaSources } from "@/api/manga.api";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import { useI18n } from "@/hooks/i18n.hook";
import { MangaState } from "@/routes/components/manga/state.manga";

export const MangaSourceRow = memo(
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
