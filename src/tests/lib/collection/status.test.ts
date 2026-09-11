import { describe, expect, it } from "vitest";

import type { TranslationKey } from "@/lib/locale/i18n.utils";
import {
  buildCustomStatusId,
  normalizeStatusLabel,
  resolveStatusLabel,
  sortStatuses,
  splitStatusLabel,
  statusLabel,
} from "@/lib/collection/status.utils";
import type { CollectionStatusDef } from "@/types/collection";

const t = (key: TranslationKey): string => key;

const STATUSES: CollectionStatusDef[] = [
  { id: "planned", label: "Planned", color: "#9ca3af", order: 0, isCore: true },
  { id: "custom_bi", label: "Reading,Читаю", color: "#3b82f6", order: 7, isCore: false },
  { id: "custom_solo", label: "Solo", color: "#22c55e", order: 8, isCore: false },
];

describe("splitStatusLabel", () => {
  it("uses a single label for both languages", () => {
    expect(splitStatusLabel("Solo")).toEqual({ en: "Solo", ru: "Solo" });
  });

  it("splits on the first comma and trims spaces", () => {
    expect(splitStatusLabel("Reading,  Читаю")).toEqual({ en: "Reading", ru: "Читаю" });
  });

  it("keeps extra commas in the Russian part", () => {
    expect(splitStatusLabel("A,B,C")).toEqual({ en: "A", ru: "B,C" });
  });

  it("falls back to the other part when one side is empty", () => {
    expect(splitStatusLabel("Reading,")).toEqual({ en: "Reading", ru: "Reading" });
    expect(splitStatusLabel(",Читаю")).toEqual({ en: "Читаю", ru: "Читаю" });
  });
});

describe("normalizeStatusLabel", () => {
  it("trims a single label", () => {
    expect(normalizeStatusLabel("  Solo  ")).toBe("Solo");
  });

  it("drops spaces around the comma", () => {
    expect(normalizeStatusLabel("Reading,  Читаю")).toBe("Reading,Читаю");
  });

  it("returns an empty string when both parts are empty", () => {
    expect(normalizeStatusLabel(" , ")).toBe("");
  });
});

describe("resolveStatusLabel", () => {
  it("picks the English part for the en locale", () => {
    expect(resolveStatusLabel("Reading,Читаю", "en")).toBe("Reading");
  });

  it("picks the Russian part for the ru locale", () => {
    expect(resolveStatusLabel("Reading,Читаю", "ru")).toBe("Читаю");
  });

  it("shows a single label in both locales", () => {
    expect(resolveStatusLabel("Solo", "en")).toBe("Solo");
    expect(resolveStatusLabel("Solo", "ru")).toBe("Solo");
  });
});

describe("statusLabel", () => {
  it("returns the i18n key for an untouched core status", () => {
    expect(statusLabel(STATUSES, "planned", t, "ru")).toBe("collection.status.planned");
  });

  it("resolves a bilingual custom status by locale", () => {
    expect(statusLabel(STATUSES, "custom_bi", t, "en")).toBe("Reading");
    expect(statusLabel(STATUSES, "custom_bi", t, "ru")).toBe("Читаю");
  });

  it("shows a single custom label in both locales", () => {
    expect(statusLabel(STATUSES, "custom_solo", t, "en")).toBe("Solo");
    expect(statusLabel(STATUSES, "custom_solo", t, "ru")).toBe("Solo");
  });

  it("returns the id for an unknown status", () => {
    expect(statusLabel(STATUSES, "missing", t, "ru")).toBe("missing");
  });
});

describe("buildCustomStatusId", () => {
  it("builds the slug from the English part", () => {
    expect(buildCustomStatusId("Reading,Читаю")).toMatch(/^custom_reading_[0-9a-z]+$/);
  });

  it("still returns an id for a Cyrillic-only label", () => {
    expect(buildCustomStatusId("Читаю")).toMatch(/^custom_[0-9a-z]+$/);
  });
});

describe("sortStatuses", () => {
  it("puts core statuses first even when a custom status has the lowest order", () => {
    const mixed: CollectionStatusDef[] = [
      { id: "custom_early", label: "Early", color: "#22c55e", order: 0, isCore: false },
      { id: "dropped", label: "Dropped", color: "#ef4444", order: 5, isCore: true },
      { id: "planned", label: "Planned", color: "#9ca3af", order: 1, isCore: true },
      { id: "custom_late", label: "Late", color: "#3b82f6", order: 2, isCore: false },
    ];
    expect(sortStatuses(mixed).map((s) => s.id)).toEqual([
      "planned",
      "dropped",
      "custom_early",
      "custom_late",
    ]);
  });

  it("pushes non-finite order last without mutating the input", () => {
    const mixed: CollectionStatusDef[] = [
      { id: "custom_nan", label: "Broken", color: "#22c55e", order: NaN, isCore: false },
      { id: "custom_ok", label: "Ok", color: "#3b82f6", order: 7, isCore: false },
    ];
    const snapshot = [...mixed];
    expect(sortStatuses(mixed).map((s) => s.id)).toEqual(["custom_ok", "custom_nan"]);
    expect(mixed.map((s) => s.id)).toEqual(snapshot.map((s) => s.id));
  });
});
