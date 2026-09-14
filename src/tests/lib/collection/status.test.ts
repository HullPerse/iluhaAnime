import { describe, expect, it } from "vitest";

import { PUBLIC_STATUS_MAX_ITEMS } from "@/config/collection/statuses.config";
import {
  buildCustomStatusId,
  isPublicStatus,
  isPublicStatusFull,
  normalizeStatusLabel,
  publicStatusIds,
  publicStatusPrefill,
  resolveStatusLabel,
  sortStatuses,
  splitStatusLabel,
  statusLabel,
} from "@/lib/collection/status.utils";
import type { TranslationKey } from "@/lib/locale/i18n.utils";
import type { CollectionStatusDef } from "@/types/collection";

const t = (key: TranslationKey): string => key;

const STATUSES: CollectionStatusDef[] = [
  { id: "planned", label: "Planned", color: "#9ca3af", order: 0, isCore: true, kind: "private" },
  {
    id: "custom_bi",
    label: "Reading,Читаю",
    color: "#3b82f6",
    order: 7,
    isCore: false,
    kind: "private",
  },
  { id: "custom_solo", label: "Solo", color: "#22c55e", order: 8, isCore: false, kind: "private" },
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
      {
        id: "custom_early",
        label: "Early",
        color: "#22c55e",
        order: 0,
        isCore: false,
        kind: "private",
      },
      {
        id: "dropped",
        label: "Dropped",
        color: "#ef4444",
        order: 5,
        isCore: true,
        kind: "private",
      },
      {
        id: "planned",
        label: "Planned",
        color: "#9ca3af",
        order: 1,
        isCore: true,
        kind: "private",
      },
      {
        id: "custom_late",
        label: "Late",
        color: "#3b82f6",
        order: 2,
        isCore: false,
        kind: "private",
      },
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
      {
        id: "custom_nan",
        label: "Broken",
        color: "#22c55e",
        order: NaN,
        isCore: false,
        kind: "private",
      },
      { id: "custom_ok", label: "Ok", color: "#3b82f6", order: 7, isCore: false, kind: "private" },
    ];
    const snapshot = [...mixed];
    expect(sortStatuses(mixed).map((s) => s.id)).toEqual(["custom_ok", "custom_nan"]);
    expect(mixed.map((s) => s.id)).toEqual(snapshot.map((s) => s.id));
  });
});

describe("public statuses", () => {
  const mixed: CollectionStatusDef[] = [
    ...STATUSES,
    { id: "share_1", label: "Friends", color: "#0ea5e9", order: 9, isCore: false, kind: "public" },
    { id: "share_2", label: "Ideas", color: "#0ea5e9", order: 10, isCore: false, kind: "public" },
  ];

  it("flags only public statuses", () => {
    expect(mixed.filter(isPublicStatus).map((s) => s.id)).toEqual(["share_1", "share_2"]);
  });

  it("collects the ids to keep out of All", () => {
    expect([...publicStatusIds(mixed)]).toEqual(["share_1", "share_2"]);
    expect([...publicStatusIds(STATUSES)]).toEqual([]);
  });
});

describe("publicStatusPrefill", () => {
  const mixed: CollectionStatusDef[] = [
    ...STATUSES,
    { id: "share_1", label: "Friends", color: "#0ea5e9", order: 9, isCore: false, kind: "public" },
  ];

  it("prefills a blank wizard draft for the selected public tab", () => {
    expect(publicStatusPrefill(mixed, "share_1")).toEqual({
      title: "",
      coverUrl: null,
      status: "share_1",
    });
  });

  it("returns null for All, private tabs, and unknown ids", () => {
    expect(publicStatusPrefill(mixed, "all")).toBeNull();
    expect(publicStatusPrefill(mixed, "planned")).toBeNull();
    expect(publicStatusPrefill(mixed, "missing")).toBeNull();
  });
});

describe("isPublicStatusFull", () => {
  const mixed: CollectionStatusDef[] = [
    ...STATUSES,
    { id: "share_1", label: "Friends", color: "#0ea5e9", order: 9, isCore: false, kind: "public" },
  ];

  it("kills the toolbar plus at and above the cap on a public tab", () => {
    expect(isPublicStatusFull(mixed, "share_1", PUBLIC_STATUS_MAX_ITEMS)).toBe(true);
    expect(isPublicStatusFull(mixed, "share_1", PUBLIC_STATUS_MAX_ITEMS + 5)).toBe(true);
  });

  it("keeps the plus alive below the cap", () => {
    expect(isPublicStatusFull(mixed, "share_1", PUBLIC_STATUS_MAX_ITEMS - 1)).toBe(false);
  });

  it("ignores the cap on private tabs, All, and unknown ids", () => {
    expect(isPublicStatusFull(mixed, "planned", 10000)).toBe(false);
    expect(isPublicStatusFull(mixed, "all", 10000)).toBe(false);
    expect(isPublicStatusFull(mixed, "missing", 10000)).toBe(false);
  });
});
