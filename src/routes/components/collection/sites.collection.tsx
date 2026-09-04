import { openUrl } from "@tauri-apps/plugin-opener";

import { useI18n } from "@/lib/i18n";
import type { CollectionItem } from "@/types/collection";

export function SitesCollection({ item }: { item: CollectionItem }) {
  const { t } = useI18n();
  const hasSites = item.sitesToView.length > 0;
  const hasTv = item.tvCurrentSeason != null || item.tvCurrentEpisode != null;
  if (!hasSites && !hasTv) return null;
  return (
    <div className="windows95-border mt-2 bg-white p-1">
      {hasSites && (
        <>
          <strong className="text-xs">{t("collection.details.sites.to.view")}</strong>
          <div className="mt-1 flex flex-col gap-0.5">
            {item.sitesToView.map((site) => (
              <button
                key={site.url}
                type="button"
                onClick={() => openUrl(site.url).catch(() => undefined)}
                className="hover:bg-surface truncate px-1 text-left text-xs text-blue-800 underline"
                title={site.url}
              >
                {site.url}
              </button>
            ))}
          </div>
        </>
      )}
      {hasTv && (
        <div className="mt-1 text-xs">
          <strong>{t("collection.details.tv.progress")}</strong>
          {item.tvCurrentSeason != null && (
            <span>
              {" "}
              {t("collection.details.season")} {item.tvCurrentSeason}
            </span>
          )}
          {item.tvCurrentEpisode != null && (
            <span>
              {" "}
              {t("collection.details.episode")} {item.tvCurrentEpisode}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
