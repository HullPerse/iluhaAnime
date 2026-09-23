import { describe, expect, it } from "vitest";

import { describeRecheckOutcome } from "@/lib/torrent/recheck.utils";
import type { TFunc, TranslationVariables } from "@/types/i18n";
import type { TorrentCheckResult } from "@/types/torrent";

function check(partial: Partial<TorrentCheckResult>): TorrentCheckResult {
  return {
    id: 1,
    missing: [],
    size_mismatch: [],
    ok: 3,
    total: 3,
    ...partial,
  };
}

const t: TFunc = (key, variables?: TranslationVariables) => {
  const vars =
    variables === undefined
      ? ""
      : ` ${Object.entries(variables)
          .map(([name, value]) => `${name}=${value}`)
          .join(" ")}`;
  return `${key}${vars}`;
};

describe("describeRecheckOutcome", () => {
  it("reports success when nothing is missing or mismatched", () => {
    expect(describeRecheckOutcome(check({}), t)).toEqual({
      tone: "success",
      message: "torrent.recheck.ok ok=3 total=3",
    });
  });

  it("lists only the missing part when sizes match", () => {
    expect(
      describeRecheckOutcome(check({ missing: ["a.mkv", "b.mkv"], ok: 1, total: 3 }), t)
    ).toEqual({
      tone: "error",
      message: "torrent.recheck.missing count=2 torrent.recheck.summary ok=1 total=3",
    });
  });

  it("lists only the size part when nothing is missing", () => {
    expect(describeRecheckOutcome(check({ size_mismatch: ["c.mkv"], ok: 2, total: 3 }), t)).toEqual(
      {
        tone: "error",
        message: "torrent.recheck.size count=1 torrent.recheck.summary ok=2 total=3",
      }
    );
  });

  it("joins both parts when files are missing and mismatched", () => {
    expect(
      describeRecheckOutcome(
        check({ missing: ["a.mkv"], size_mismatch: ["b.mkv"], ok: 1, total: 3 }),
        t
      )
    ).toEqual({
      tone: "error",
      message:
        "torrent.recheck.missing count=1; torrent.recheck.size count=1 torrent.recheck.summary ok=1 total=3",
    });
  });
});
