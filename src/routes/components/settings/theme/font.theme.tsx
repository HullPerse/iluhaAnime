import { useMemo } from "react";

import { systemApi } from "@/api/system.api";
import Combobox from "@/components/ui/combobox.component";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { queryKeys } from "@/lib/keys.utils";
import { useCell } from "@/lib/signal.hook";
import { attemptSync, reportBackgroundError } from "@/lib/attempt.utils";
import { patchSettings, settingsAtoms } from "@/store/settings.store";

function readCachedFonts(): string[] {
  const [parsed, error] = attemptSync(() => {
    const raw = localStorage.getItem("systemFontsCache");
    if (!raw) return null;
    const value = JSON.parse(raw) as { fonts: string[]; ts: number };
    if (
      Array.isArray(value.fonts) &&
      typeof value.ts === "number" &&
      Date.now() - value.ts < 7 * 24 * 60 * 60 * 1000
    )
      return value.fonts;
    return null;
  });
  if (error) reportBackgroundError("fonts.cache.parse", error);
  return parsed ?? [];
}

export function FontSelector() {
  const appFont = useCell(settingsAtoms.appFont);
  const { t } = useI18n();
  const initialFonts = useMemo(() => readCachedFonts(), []);
  const fontsQuery = useAppQuery("slow", {
    queryKey: queryKeys.systemFonts(),
    queryFn: async () => {
      const list = await systemApi.listSystemFonts();
      const [, cacheError] = attemptSync(() =>
        localStorage.setItem("systemFontsCache", JSON.stringify({ fonts: list, ts: Date.now() }))
      );
      if (cacheError) reportBackgroundError("fonts.cache.write", cacheError);
      return list;
    },
    enabled: initialFonts.length === 0,
    staleTime: Infinity,
  });
  const fonts = fontsQuery.data ?? initialFonts;
  const loading = fonts.length === 0 && (fontsQuery.isLoading || fontsQuery.isFetching);
  const error = fontsQuery.error == null ? null : t("settings.font.load.error");
  type FontOption = {
    value: string;
    label: string;
    style?: React.CSSProperties;
  };
  const options = useMemo(() => {
    const base: FontOption[] = [];
    const seen = new Set<string>();
    const push = (value: string, label: string, style?: React.CSSProperties) => {
      if (seen.has(value.toLowerCase())) return;
      seen.add(value.toLowerCase());
      base.push({ value, label, style });
    };
    push("iluhaAnime", "iluhaAnime", { fontFamily: '"iluhaAnime"' });
    push("", t("settings.font.default"));
    for (const f of fonts) {
      const escaped = f.replace(/"/g, '\\"');
      push(f, f, { fontFamily: `"${escaped}"` });
    }
    return base;
  }, [fonts, t]);
  if (loading && fonts.length === 0) {
    return (
      <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-0.5">
        <span className="windows95-text text-text flex items-center text-xs font-bold">
          {t("settings.font.title")}
        </span>
        <div className="flex flex-col gap-0.5">
          <span className="text-hint text-[12px]">{t("common.loading")}</span>
          {error && <span className="text-destructive text-[12px]">{error}</span>}
        </div>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-0.5">
      <span className="windows95-text text-text flex items-center text-xs font-bold">
        {t("settings.font.title")}
      </span>
      <div className="flex flex-col gap-0.5">
        <Combobox
          value={appFont ?? ""}
          onChange={(v) => patchSettings({ appFont: v || null })}
          options={options}
          indexed
          className="max-w-xs"
        />
        {error && <span className="text-destructive text-[12px]">{error}</span>}
      </div>
    </div>
  );
}
