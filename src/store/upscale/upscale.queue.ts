import type { UpscaleQueueItem } from "@/types/core/upscale";

let nextId = 1;

export function genId(): string {
  return `job_${nextId++}`;
}

function sameJobConfig(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function findDuplicate(
  items: UpscaleQueueItem[],
  jobType: "convert" | "upscale",
  filePath: string,
  config: unknown
): UpscaleQueueItem | undefined {
  return items.find(
    (item) =>
      (item.status === "queued" || item.status === "processing") &&
      item.jobType === jobType &&
      item.filePath === filePath &&
      sameJobConfig(item.config, config)
  );
}
