import { describe, expect, it } from "vitest";

import {
  andThen,
  attemptResult,
  attemptResultSync,
  err,
  map,
  ok,
  unwrapOr,
} from "@/lib/utils/result.utils";

describe("ok / err", () => {
  it("wrap the two outcomes", () => {
    expect(ok(3)).toEqual({ ok: true, value: 3 });
    expect(err("boom")).toEqual({ ok: false, error: new Error("boom") });
  });

  it("keeps falsy successes distinct from failures", () => {
    expect(ok(0)).toEqual({ ok: true, value: 0 });
    expect(ok(null)).toEqual({ ok: true, value: null });
    expect(ok(undefined)).toEqual({ ok: true, value: undefined });
  });

  it("passes Error instances through untouched", () => {
    const cause = new Error("cause");
    expect(err(cause)).toEqual({ ok: false, error: cause });
  });
});

describe("attemptResult", () => {
  it("resolves fulfilled values", async () => {
    await expect(attemptResult(Promise.resolve("ok"))).resolves.toEqual({ ok: true, value: "ok" });
  });

  it("turns rejections into failures instead of throwing", async () => {
    const failure = new Error("down");
    await expect(attemptResult(Promise.reject(failure))).resolves.toEqual({
      ok: false,
      error: failure,
    });
  });

  it("normalizes non-Error rejections", async () => {
    const plain = "plain" as unknown as Error;
    await expect(attemptResult(Promise.reject(plain))).resolves.toEqual({
      ok: false,
      error: new Error("plain"),
    });
  });
});

describe("attemptResultSync", () => {
  it("returns the value, or the thrown error", () => {
    expect(attemptResultSync(() => 1)).toEqual({ ok: true, value: 1 });
    expect(
      attemptResultSync(() => {
        throw new Error("sync boom");
      })
    ).toEqual({ ok: false, error: new Error("sync boom") });
  });
});

describe("map", () => {
  it("transforms a success and leaves a failure alone", () => {
    expect(map(ok(2), (value) => value * 3)).toEqual({ ok: true, value: 6 });

    const failure = err("boom");
    expect(map(failure, (value: number) => value * 3)).toBe(failure);
  });
});

describe("andThen", () => {
  it("runs the next step on success", async () => {
    await expect(andThen(ok(2), (value) => ok(value + 1))).resolves.toEqual({ ok: true, value: 3 });
  });

  it("awaits async steps", async () => {
    await expect(andThen(ok(1), async (value) => ok(value + 1))).resolves.toEqual({
      ok: true,
      value: 2,
    });
  });

  it("short-circuits on failure without running the step", async () => {
    const failure = err("first step failed");
    let ran = false;
    const chained = await andThen(failure, () => {
      ran = true;
      return ok("never");
    });
    expect(ran).toBe(false);
    expect(chained).toEqual(failure);
  });

  it("keeps a failing step's error", async () => {
    const thrown = new Error("step threw");
    await expect(
      andThen(ok(1), () => {
        throw thrown;
      })
    ).resolves.toEqual({ ok: false, error: thrown });
  });
});

describe("unwrapOr", () => {
  it("returns the value or the fallback", () => {
    expect(unwrapOr(ok("value"), "fallback")).toBe("value");
    expect(unwrapOr(err("boom"), "fallback")).toBe("fallback");
    expect(unwrapOr(err("boom"), null)).toBeNull();
  });
});
