import { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ChevronDown, ChevronUp, Clock } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox.component";

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

const CATEGORY_LABELS: Record<string, string> = {
  preprocess: "Предобработка",
  restore: "Восстановление",
  upscale: "Апскейл",
  postprocess: "Постобработка",
};

const CATEGORY_ORDER = ["preprocess", "restore", "upscale", "postprocess"];

function formatETA(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  if (seconds < 60) return "< 1 мин";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (s > 0) return `~${m} мин ${s} сек`;
  return `~${m} мин`;
}

export default function ShaderPicker({
  value,
  onChange,
  gpuBackend,
  durationSecs,
}: Props) {
  const [shaders, setShaders] = useState<ShaderInfo[]>([]);
  const [openCategories, setOpenCategories] = useState<Set<string>>(
    new Set(["upscale", "restore"]),
  );

  useEffect(() => {
    invoke<ShaderInfo[]>("list_anime4k_shaders")
      .then(setShaders)
      .catch(() => {});
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, ShaderInfo[]>();
    for (const cat of CATEGORY_ORDER) {
      map.set(
        cat,
        shaders.filter((s) => s.category === cat),
      );
    }
    return map;
  }, [shaders]);

  const selectedSet = useMemo(() => new Set(value), [value]);

  const isDisabled = useCallback(
    (shader: ShaderInfo) => {
      if (!shader.exclusive_group) return false;
      // If another shader in the same exclusive group is selected, disable this one
      return shaders.some(
        (s) =>
          s.id !== shader.id &&
          s.exclusive_group === shader.exclusive_group &&
          selectedSet.has(s.id),
      );
    },
    [shaders, selectedSet],
  );

  const handleToggle = useCallback(
    (shader: ShaderInfo) => {
      const next = new Set(selectedSet);
      if (shader.exclusive_group) {
        // For exclusive groups: deselect others in same group, then toggle this one
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
        // For non-exclusive: simple toggle
        if (next.has(shader.id)) {
          next.delete(shader.id);
        } else {
          next.add(shader.id);
        }
      }
      onChange(Array.from(next));
    },
    [shaders, selectedSet, onChange],
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
    return formatETA(durationSecs / totalSpeed);
  }, [value, shaders, gpuBackend, durationSecs]);

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
      <div className="windows95-text text-xs p-1">Загрузка шейдеров...</div>
    );
  }

  return (
    <div className="border windows95-border bg-white p-1 flex flex-col gap-1">
      <div className="windows95-text text-xs font-bold flex items-center justify-between">
        <span>Шейдеры Anime4K</span>
        {eta && (
          <span className="flex items-center gap-1 text-muted-foreground">
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
              className="flex items-center gap-1 windows95-text text-xs hover:underline text-left"
              onClick={() => toggleCategory(cat)}
            >
              {isOpen ? (
                <ChevronUp className="size-3" />
              ) : (
                <ChevronDown className="size-3" />
              )}
              {CATEGORY_LABELS[cat] || cat}
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
                          className={`flex items-center gap-1 windows95-text text-xs cursor-pointer select-none ${disabled ? "opacity-50 cursor-default" : ""}`}
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
                              .replace(/_/g, " ")
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
                        className="flex items-center gap-1 windows95-text text-xs cursor-pointer select-none"
                        title={shader.description}
                      >
                        <Checkbox
                          checked={checked}
                          onChange={() => handleToggle(shader)}
                        />
                        <span>
                          {shader.id
                            .replace(/_/g, " ")
                            .replace(/^./, (c) => c.toUpperCase())}
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
