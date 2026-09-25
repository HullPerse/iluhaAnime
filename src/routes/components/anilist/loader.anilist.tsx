import { useEffect, useState } from "react";

import { TabLoader } from "@/components/shared/loader.component";
import { ANILIST_LOADER_TICK_MS, ANILIST_SLOW_SEC } from "@/config/anilist/loading.config";
import { useI18n } from "@/lib/locale/i18n.utils";
import { formatElapsed } from "@/lib/utils/time.utils";

export default function AniListLoader({ className }: { className?: string }) {
  const { t } = useI18n();
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setElapsed((prev) => prev + 1), ANILIST_LOADER_TICK_MS);
    return () => clearInterval(timer);
  }, []);
  return (
    <TabLoader className={className}>
      <span className="windows95-text text-hint text-xs">{formatElapsed(elapsed, t)}</span>
      {elapsed >= ANILIST_SLOW_SEC && (
        <span className="windows95-text text-hint max-w-64 text-center text-xs">
          {t("anilist.loading.slow")}
        </span>
      )}
    </TabLoader>
  );
}
