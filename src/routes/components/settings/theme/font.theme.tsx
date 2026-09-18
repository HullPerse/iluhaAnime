import { useEffect, useMemo, useState } from "react";

import Combobox from "@/components/ui/combobox.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import { attempt, attemptSync, reportBackgroundError } from "@/lib/utils/attempt.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { useSettingsStore } from "@/store/settings.store";

export function FontSelector() {
  const appFont = useSettingsStore((s) => s.appFont);
  const patch = useSettingsStore((s) => s.patch);
  const { t } = useI18n();
  const [fonts, setFonts] = useState<string[]>(() => {
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
  });
  const [loading, setLoading] = useState(fonts.length === 0);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (fonts.length > 0) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [list, listError] = await attempt(invokeTyped<string[]>("list_system_fonts"));
      if (cancelled) return;
      if (listError) {
        setError(t("settings.font.load.error"));
        setLoading(false);
        return;
      }
      setFonts(list);
      setLoading(false);
      const [, cacheError] = attemptSync(() =>
        localStorage.setItem("systemFontsCache", JSON.stringify({ fonts: list, ts: Date.now() }))
      );
      if (cacheError) reportBackgroundError("fonts.cache.write", cacheError);
    })();
    return () => {
      cancelled = true;
    };
  }, [fonts.length, t]);
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
          onChange={(v) => patch({ appFont: v || null })}
          options={options}
          indexed
          className="max-w-xs"
        />
        {error && <span className="text-destructive text-[12px]">{error}</span>}
      </div>
    </div>
  );
}
