import { describe, expect, it } from "vitest";

import { attempt, attemptSync, toError, withFallback } from "@/lib/utils/attempt.utils";

describe("toError", () => {
  it("passes Error instances through untouched", () => {
    const cause = new Error("boom");
    expect(toError(cause)).toBe(cause);
  });

  it("wraps strings, nullish, and objects in an Error", () => {
    expect(toError("nope")).toEqual(new Error("nope"));
    expect(toError(undefined)).toEqual(new Error("undefined"));
    expect(toError(42)).toEqual(new Error("42"));
  });
});

describe("attempt", () => {
  it("resolves fulfilled values with a null error", async () => {
    await expect(attempt(Promise.resolve(7))).resolves.toEqual([7, null]);
  });

  it("keeps falsy fulfilled values distinct from failure", async () => {
    await expect(attempt(Promise.resolve(0))).resolves.toEqual([0, null]);
    await expect(attempt(Promise.resolve(null))).resolves.toEqual([null, null]);
  });

  it("converts rejections into a null-data tuple instead of throwing", async () => {
    const failure = new Error("down");
    await expect(attempt(Promise.reject(failure))).resolves.toEqual([null, failure]);
  });

  it("normalizes non-Error rejections", async () => {
    const plain = "plain" as unknown as Error;
    await expect(attempt(Promise.reject(plain))).resolves.toEqual([null, new Error("plain")]);
  });
});

describe("attemptSync", () => {
  it("returns the value with a null error", () => {
    expect(attemptSync(() => 3)).toEqual([3, null]);
  });

  it("converts throws into a null-data tuple", () => {
    const failure = new Error("sync boom");
    expect(
      attemptSync(() => {
        throw failure;
      })
    ).toEqual([null, failure]);
  });

  it("normalizes non-Error throws", () => {
    const literal = "string throw" as unknown as Error;
    expect(
      attemptSync(() => {
        throw literal;
      })
    ).toEqual([null, new Error("string throw")]);
  });
});

describe("withFallback", () => {
  it("resolves the value when the promise fulfills", async () => {
    await expect(withFallback(Promise.resolve("ok"), "fallback")).resolves.toBe("ok");
  });

  it("resolves null data as-is instead of substituting the fallback", async () => {
    await expect(withFallback(Promise.resolve(null), "fallback")).resolves.toBeNull();
  });

  it("resolves the fallback when the promise rejects", async () => {
    await expect(withFallback(Promise.reject(new Error("down")), "fallback")).resolves.toBe(
      "fallback"
    );
  });
});
