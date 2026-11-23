import { describe, expect, it } from "vitest";
import { listStatusLabels } from "@/config/system/labels.config";
import { getStatusColor } from "@/lib/anilist/entries.utils";
import { mangaStatusColor } from "@/lib/manga/statusColor.utils";

describe("status presentation", () => {
  it("resolves AniList list names like their status codes", () => {
    expect(listStatusLabels.WATCHING).toBe(listStatusLabels.CURRENT);
    expect(getStatusColor("WATCHING")).toBe(getStatusColor("CURRENT"));
  });
  it("matches manga defaults to AniList without changing custom colors", () => {
    for (const [color, status] of [["highlight", "CURRENT"], ["success", "COMPLETED"], ["text", "PLANNING"], ["warning", "PAUSED"], ["destructive", "DROPPED"]] as const) {
      expect(mangaStatusColor(color)).toBe(getStatusColor(status));
    }

    expect(mangaStatusColor("#123456")).toBe("#123456");
  });
});
