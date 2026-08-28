import type { CollectionStatusDef } from "@/types/collection";

export function statusColorOf(statuses: CollectionStatusDef[], id: string): string {
  return statuses.find((s) => s.id === id)?.color ?? "#9ca3af";
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
