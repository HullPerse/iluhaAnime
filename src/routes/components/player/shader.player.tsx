import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { ChevronDown, ChevronUp, Clock } from "lucide-react";
import { useState, useCallback, useMemo } from "react";

import { Checkbox } from "@/components/ui/checkbox.component";
import { CATEGORY_ORDER } from "@/config/shader.config";
import { useI18n } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n";

interface ShaderInfo {
  id: string;
  filename: string;
  category: string;
  description: string;
  speed_factor: number;
  is_default: boolean;
  exclusive_group: string | null;
}

interface Props {
  value: string[];
  onChange: (selected: string[]) => void;
  gpuBackend: string;
  durationSecs?: number;
}

const CATEGORY_LABELS: Record<string, TranslationKey> = {
  preprocess: "player.shader.preprocess",
  restore: "player.shader.restore",
  upscale: "player.shader.upscale",
  postprocess: "player.shader.postprocess",
};

function formatETA(
  seconds: number,
  t: (
    key: TranslationKey,
    variables?: Record<string, string | number>
  ) => string
): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  if (seconds < 60) return t("player.eta.lessThanMinute");
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (s > 0) return t("player.eta.minutesSeconds", { m, s });
  return t("player.eta.minutes", { m });
}

export default function ShaderPicker({
  value,
  onChange,
  gpuBackend,
  durationSecs,
}: Props) {
  const { t } = useI18n();
  const [openCategories, setOpenCategories] = useState<Set<string>>(
    new Set(["upscale", "restore"])
  );

  const { data: shaders = [] } = useQuery({
    queryKey: ["anime4k_shaders"],
    queryFn: () => invoke<ShaderInfo[]>("list_anime4k_shaders"),
    staleTime: Infinity,
  });

  const grouped = useMemo(() => {
    const map = new Map<string, ShaderInfo[]>();
    for (const cat of CATEGORY_ORDER) {
      map.set(
        cat,
        shaders.filter((s) => s.category === cat)
      );
    }
    return map;
  }, [shaders]);

  const selectedSet = useMemo(() => new Set(value), [value]);

  const isDisabled = useCallback(
    (shader: ShaderInfo) => {
      if (!shader.exclusive_group) return false;
      return shaders.some(
        (s) =>
          s.id !== shader.id &&
          s.exclusive_group === shader.exclusive_group &&
          selectedSet.has(s.id)
      );
    },
    [shaders, selectedSet]
  );

  const handleToggle = useCallback(
    (shader: ShaderInfo) => {
      const next = new Set(selectedSet);
      if (shader.exclusive_group) {
        for (const s of shaders) {
          if (
            s.id !== shader.id &&
            s.exclusive_group === shader.exclusive_group
          ) {
            next.delete(s.id);
          }
        }
        if (next.has(shader.id)) {
          next.delete(shader.id);
        } else {
          next.add(shader.id);
        }
      } else {
        if (next.has(shader.id)) {
          next.delete(shader.id);
        } else {
          next.add(shader.id);
        }
      }
      onChange([...next]);
    },
    [shaders, selectedSet, onChange]
  );

  const eta = useMemo(() => {
    if (!durationSecs || durationSecs <= 0) return "";
    const baseSpeed =
      { nvenc: 2.5, amf: 1.8, qsv: 1.5, cpu: 0.8 }[gpuBackend] || 0.8;
    const penalty = value.reduce((acc, id) => {
      const sf = shaders.find((s) => s.id === id)?.speed_factor ?? 1;
      return acc * sf;
    }, 1);
    const totalSpeed = baseSpeed * Math.max(penalty, 0.05);
    return formatETA(durationSecs / totalSpeed, t);
  }, [value, shaders, gpuBackend, durationSecs, t]);

  const toggleCategory = useCallback((cat: string) => {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  if (shaders.length === 0) {
    return (
      <div className="windows95-text p-1 text-xs">
        {t("player.shader.loading")}
      </div>
    );
  }

  return (
    <div className="windows95-border flex flex-col gap-1 border bg-white p-1">
      <div className="windows95-text flex items-center justify-between text-xs font-bold">
        <span>{t("player.shader.title")}</span>
        {eta && (
          <span className="text-muted-foreground flex items-center gap-1">
            <Clock className="size-3" />
            {eta}
          </span>
        )}
      </div>

      {CATEGORY_ORDER.map((cat) => {
        const items = grouped.get(cat) || [];
        if (items.length === 0) return null;
        const isOpen = openCategories.has(cat);
        const hasExclusive = items.some((s) => s.exclusive_group !== null);

        return (
          <div key={cat} className="flex flex-col gap-0.5">
            <button
              type="button"
              className="windows95-text flex items-center gap-1 text-left text-xs hover:underline"
              onClick={() => toggleCategory(cat)}
            >
              {isOpen ? (
                <ChevronUp className="size-3" />
              ) : (
                <ChevronDown className="size-3" />
              )}
              {t(CATEGORY_LABELS[cat] ?? (cat as never))}
            </button>

            {isOpen && (
              <div
                className={`flex flex-col gap-0.5 pl-4 ${hasExclusive ? "" : ""}`}
              >
                {hasExclusive ? (
                  <div className="flex flex-wrap gap-2">
                    {items.map((shader) => {
                      const checked = selectedSet.has(shader.id);
                      const disabled = isDisabled(shader);
                      return (
                        <label
                          key={shader.id}
                          className={`windows95-text flex cursor-pointer items-center gap-1 text-xs select-none ${disabled ? "cursor-default opacity-50" : ""}`}
                          title={shader.description}
                        >
                          <Checkbox
                            checked={checked}
                            onChange={() => handleToggle(shader)}
                            disabled={disabled}
                          />
                          <span>
                            {shader.id
                              .replace(/^(restore_|upscale_)/, "")
                              .replaceAll(/_/g, " ")
                              .toUpperCase()}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  items.map((shader) => {
                    const checked = selectedSet.has(shader.id);
                    return (
                      <label
                        key={shader.id}
                        className="windows95-text flex cursor-pointer items-center gap-1 text-xs select-none"
                        title={shader.description}
                      >
                        <Checkbox
                          checked={checked}
                          onChange={() => handleToggle(shader)}
                        />
                        <span>
                          {shader.id
                            .replaceAll(/_/g, " ")
                            .replace(/^./u, (c: string) => c.toUpperCase())}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
