import { CORE_DEFAULT_LABELS } from "@/config/collection.config";
import type { TranslationKey } from "@/lib/i18n";
import type { CollectionStatusDef } from "@/types/collection";

export function statusColorOf(statuses: CollectionStatusDef[], id: string): string {
  return statuses.find((s) => s.id === id)?.color ?? "#9ca3af";
}

export function statusLabel(
  statuses: CollectionStatusDef[],
  id: string,
  t: (key: TranslationKey) => string
): string {
  const def = statuses.find((s) => s.id === id);
  if (!def) return id;
  if (def.isCore && CORE_DEFAULT_LABELS[def.id] === def.label) {
    return t(`collection.status.${def.id}` as TranslationKey);
  }
  return def.label;
}

export function formatDate(ts: number | null): string {
  if (!ts) return "-";
  return new Date(ts).toLocaleDateString();
}

export function generatePlaceholder(text: string): string {
  const canvas = document.createElement("canvas");
  canvas.width = 300;
  canvas.height = 420;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "#c0c0c0";
  ctx.fillRect(0, 0, 300, 420);
  ctx.strokeStyle = "#808080";
  ctx.lineWidth = 2;
  ctx.strokeRect(4, 4, 292, 412);
  ctx.fillStyle = "#000080";
  ctx.fillRect(4, 4, 292, 28);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 12px monospace";
  ctx.fillText("iluhaAnime", 10, 20);
  ctx.fillStyle = "#000000";
  ctx.font = "bold 20px monospace";
  const words = text.slice(0, 30).split(" ");
  let line = "";
  let y = 200;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > 260 && line) {
      ctx.fillText(line, 20, y);
      line = word;
      y += 24;
    } else {
      line = test;
    }
    if (y > 360) break;
  }
  if (line) ctx.fillText(line, 20, y);
  return canvas.toDataURL("image/png");
}

export function buildCustomStatusId(label: string): string | null {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
  if (!slug) return null;
  return `custom_${slug}_${Date.now().toString(36)}`;
}
