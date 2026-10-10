import { bench, group } from "@pmndrs/labs";
// Direct bench of the persist envelope and the share payload, three ways:
// the hand-rolled guards the code had, an uncompiled zod/mini schema, and the
// compiled schema the persistor now uses. The envelope runs ~10 times per app
// start and the share payload only on a clicked link, so the question is
// whether the schema costs anything at those volumes, not the per-call delta.
// Budget (avg/iter, Ryzen 7 5800X/node 26.3.0, 2026-10-10) for 2000/500
// iterations: plain JSON.parse 1.49ms, envelope manual 1.58ms, envelope
// compiled 1.94ms, envelope uncompiled 2.85ms, share 12 items manual 2.92ms,
// share compiled 3.52ms, share uncompiled 5.38ms. Before the trim (record walk
// plus per-field checks in schema) it was envelope compiled 3.03ms and share
// compiled 4.46ms, so the trim cut 36 percent off the envelope and 21 percent
// off the share payload. Remaining overhead per call is about 0.18us per
// envelope (roughly 10 per app start, under 2us total) and 1.2us per clicked
// share link. Both are noise. Regression threshold is labs minDelta 5%.
import * as z from "zod/mini";

import { attemptSync } from "../../src/lib/utils/attempt.utils";
import { parseValue } from "../../src/lib/utils/schema.utils";

const PAYLOAD = JSON.stringify({
  f: 1,
  store: "settings",
  sv: 37,
  ts: 1700000000000,
  data: {
    pageSize: 40,
    theme: "tokyo-night",
    flags: ["a", "b", "c"],
    nested: { x: 1, y: [1, 2, 3] },
  },
});

const SHARE_ITEM = {
  title: " Sousou no Frieren ",
  type: "anime",
  year: 2028,
  status: " planning ",
  externalIds: { anilist: 154587, mal: 52991 },
  coverUrl: "https://s4.anilist.co/file/frieren.jpg",
};

const SHARE_PAYLOAD = JSON.stringify({
  version: 1,
  label: "Ideas for tonight",
  items: Array.from({ length: 12 }, (_, index) => ({
    ...SHARE_ITEM,
    title: `${SHARE_ITEM.title} ${index}`,
  })),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const EnvelopeManual = (raw: string): number => {
  const [parsed, parseError] = attemptSync(() => JSON.parse(raw) as unknown);
  if (parseError !== null || !isRecord(parsed)) return 0;
  if (parsed.f !== 1 || parsed.store !== "settings") return 0;
  if (typeof parsed.sv !== "number" || !isRecord(parsed.data)) return 0;
  return parsed.sv;
};

const EnvelopeSchema = z.object({
  f: z.literal(1),
  store: z.string(),
  sv: z.number(),
  ts: z.optional(z.number()),
  data: z.unknown(),
});

const CompiledEnvelope = z.compile(EnvelopeSchema);

const EnvelopeZod = (raw: string): number => {
  const parsed = parseValue(JSON.parse(raw) as unknown, EnvelopeSchema);
  return parsed.ok ? parsed.value.sv : 0;
};

const EnvelopeCompiled = (raw: string): number => {
  const parsed = parseValue(JSON.parse(raw) as unknown, CompiledEnvelope);
  return parsed.ok ? parsed.value.sv : 0;
};

const ShareSchema = z.object({
  version: z.literal(1),
  label: z.optional(z.unknown()),
  items: z
    .array(
      z.object({
        title: z.string(),
        type: z.enum(["anime", "movie", "series", "custom"]),
        year: z.optional(z.unknown()),
        status: z.string(),
        externalIds: z.optional(z.unknown()),
        coverUrl: z.optional(z.unknown()),
      })
    )
    .check(z.minLength(1), z.maxLength(500)),
});

const CompiledShare = z.compile(ShareSchema);

const ShareZod = (raw: string): number => {
  const parsed = parseValue(JSON.parse(raw) as unknown, ShareSchema);
  return parsed.ok ? parsed.value.items.length : 0;
};

const ShareCompiled = (raw: string): number => {
  const parsed = parseValue(JSON.parse(raw) as unknown, CompiledShare);
  return parsed.ok ? parsed.value.items.length : 0;
};

const SHARE_MAX_ITEMS = 500;
const SHARE_MAX_TITLE = 200;
const SHARE_MAX_STATUS = 64;

const ShareManual = (raw: string): number => {
  const [value, error] = attemptSync(() => JSON.parse(raw) as unknown);
  if (error !== null || !isRecord(value) || value.version !== 1) return 0;
  const items = value.items;
  if (!Array.isArray(items) || items.length === 0 || items.length > SHARE_MAX_ITEMS) return 0;
  for (const rawItem of items) {
    if (!isRecord(rawItem)) return 0;
    const title = typeof rawItem.title === "string" ? rawItem.title.trim() : "";
    if (title.length === 0 || title.length > SHARE_MAX_TITLE) return 0;
    const status = typeof rawItem.status === "string" ? rawItem.status.trim() : "";
    if (status.length === 0 || status.length > SHARE_MAX_STATUS) return 0;
    if (!["anime", "movie", "series", "custom"].includes(rawItem.type as string)) return 0;
  }
  return items.length;
};

group("schema @utils @quick", () => {
  bench("envelope 1KB x2000 (manual guards)", () => {
    let sum = 0;
    for (let i = 0; i < 2000; i++) sum += EnvelopeManual(PAYLOAD);
    return sum;
  });

  bench("envelope 1KB x2000 (zod mini)", () => {
    let sum = 0;
    for (let i = 0; i < 2000; i++) sum += EnvelopeZod(PAYLOAD);
    return sum;
  });

  bench("envelope 1KB x2000 (compiled)", () => {
    let sum = 0;
    for (let i = 0; i < 2000; i++) sum += EnvelopeCompiled(PAYLOAD);
    return sum;
  });

  bench("share payload 12 items x500 (manual guards)", () => {
    let sum = 0;
    for (let i = 0; i < 500; i++) sum += ShareManual(SHARE_PAYLOAD);
    return sum;
  });

  bench("share payload 12 items x500 (zod mini)", () => {
    let sum = 0;
    for (let i = 0; i < 500; i++) sum += ShareZod(SHARE_PAYLOAD);
    return sum;
  });

  bench("share payload 12 items x500 (compiled)", () => {
    let sum = 0;
    for (let i = 0; i < 500; i++) sum += ShareCompiled(SHARE_PAYLOAD);
    return sum;
  });

  bench("plain JSON.parse 1KB x2000 (baseline)", () => {
    let sum = 0;
    for (let i = 0; i < 2000; i++) {
      const [value, error] = attemptSync(() => JSON.parse(PAYLOAD) as unknown);
      if (error === null && isRecord(value) && typeof value.sv === "number") sum += value.sv;
    }
    return sum;
  });
});
