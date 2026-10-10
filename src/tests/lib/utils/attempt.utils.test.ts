import { describe, expect, it, vi } from "vitest";

import {
  attempt,
  attemptAll,
  attemptAs,
  attemptAsSync,
  attemptRetry,
  attemptSync,
  toError,
  withFallback,
} from "@/lib/utils/attempt.utils";
import {
  attemptAllLimit,
  attemptResult,
  err,
  mapError,
  ok,
  retry,
  tap,
  unwrapOr,
  withResource,
  withTimeout,
} from "@/lib/utils/result.utils";

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function rejectWith(value: unknown): Promise<never> {
  return new Promise((_resolve, reject) => reject(value));
}

describe("attempt utils contract", () => {
  it("keeps the tuple shape on success and failure", async () => {
    await expect(attempt(Promise.resolve(7))).resolves.toEqual([7, null]);
    await expect(attempt(Promise.reject(new Error("boom")))).resolves.toEqual([
      null,
      new Error("boom"),
    ]);
    expect(attemptSync(() => 1)).toEqual([1, null]);
    expect(
      attemptSync(() => {
        throw new Error("sync boom");
      })
    ).toEqual([null, new Error("sync boom")]);
  });

  it("normalizes non-Error rejections", async () => {
    const [value, error] = await attempt(rejectWith("plain string"));
    expect(value).toBeNull();
    expect(error).toEqual(new Error("plain string"));
  });

  it("returns a fallback when the promise fails", async () => {
    await expect(withFallback(Promise.reject(new Error("x")), 5)).resolves.toBe(5);
    await expect(withFallback(Promise.resolve(3), 5)).resolves.toBe(3);
  });

  it("runs every step and reports the first failure", async () => {
    const order: string[] = [];
    const failure = await attemptAll([
      () => order.push("a"),
      () => {
        throw new Error("mid");
      },
      () => order.push("c"),
    ]);
    expect(failure).toEqual(new Error("mid"));
    expect(order).toEqual(["a"]);
  });

  it("runs onFinally even when a step failed", async () => {
    const finallyCalls: string[] = [];
    const failure = await attemptAll([() => Promise.reject(new Error("first"))], {
      onFinally: () => finallyCalls.push("done"),
    });
    expect(failure).toEqual(new Error("first"));
    expect(finallyCalls).toEqual(["done"]);
  });

  it("prefers the first failure over the onFinally failure", async () => {
    const failure = await attemptAll([() => Promise.reject(new Error("first"))], {
      onFinally: () => {
        throw new Error("finally");
      },
    });
    expect(failure).toEqual(new Error("first"));
  });

  it("keeps the raw value in toError when it is already an Error", () => {
    const original = new Error("kept");
    expect(toError(original)).toBe(original);
  });
});

describe("attemptAs contract", () => {
  class DbError extends Error {
    readonly code: string;

    constructor(code: string) {
      super(code);
      this.name = "DbError";
      this.code = code;
    }
  }

  const toDbError = (error: unknown): DbError =>
    new DbError(error instanceof Error ? error.message : "unknown");

  it("maps a rejection into the caller's error type", async () => {
    const [value, error] = await attemptAs(Promise.reject(new Error("locked")), toDbError);
    expect(value).toBeNull();
    expect(error).toBeInstanceOf(DbError);
    expect(error).toEqual(new DbError("locked"));
  });

  it("passes the value through untouched on success", async () => {
    const [value, error] = await attemptAs(Promise.resolve("row"), toDbError);
    expect(value).toBe("row");
    expect(error).toBeNull();
  });

  it("maps a sync failure", () => {
    const [value, error] = attemptAsSync(() => {
      throw new Error("write");
    }, toDbError);
    expect(value).toBeNull();
    expect(error).toEqual(new DbError("write"));
  });
});

describe("attemptRetry contract", () => {
  it("returns on the first success without retrying", async () => {
    let calls = 0;
    const [value, error] = await attemptRetry(
      async () => {
        calls += 1;
        return "ok";
      },
      { attempts: 3, delay: 0 }
    );
    expect(error).toBeNull();
    expect(value).toBe("ok");
    expect(calls).toBe(1);
  });

  it("retries until success and keeps the last failure count", async () => {
    let calls = 0;
    const [value, error] = await attemptRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw new Error("flaky");
        return calls;
      },
      { attempts: 3, delay: 0 }
    );
    expect(error).toBeNull();
    expect(value).toBe(3);
    expect(calls).toBe(3);
  });

  it("gives up after attempts and reports the last error", async () => {
    let calls = 0;
    const [value, error] = await attemptRetry(
      async () => {
        calls += 1;
        throw new Error(`fail ${calls}`);
      },
      { attempts: 3, delay: 0 }
    );
    expect(value).toBeNull();
    expect(error).toEqual(new Error("fail 3"));
    expect(calls).toBe(3);
  });

  it("stops early when shouldRetry rejects the error", async () => {
    let calls = 0;
    const [value, error] = await attemptRetry(
      async () => {
        calls += 1;
        throw new Error("permanent");
      },
      {
        attempts: 5,
        delay: 0,
        shouldRetry: (failure) => !failure.message.includes("permanent"),
      }
    );
    expect(value).toBeNull();
    expect(error).toEqual(new Error("permanent"));
    expect(calls).toBe(1);
  });

  it("waits the backoff delay between attempts", async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const pending = attemptRetry(
        async () => {
          calls += 1;
          if (calls < 2) throw new Error("flaky");
          return "late";
        },
        { attempts: 2, delay: 50, backoff: 2 }
      );
      await vi.advanceTimersByTimeAsync(0);
      expect(calls).toBe(1);
      await vi.advanceTimersByTimeAsync(49);
      expect(calls).toBe(1);
      await vi.advanceTimersByTimeAsync(2);
      await expect(pending).resolves.toEqual(["late", null]);
      expect(calls).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops retrying when the signal aborts", async () => {
    const controller = new AbortController();
    let calls = 0;
    const pending = attemptRetry(
      async () => {
        calls += 1;
        controller.abort();
        throw new Error("flaky");
      },
      { attempts: 4, delay: 0, signal: controller.signal }
    );
    const [value, error] = await pending;
    expect(value).toBeNull();
    expect(error).toBe(controller.signal.reason);
    expect(calls).toBe(1);
  });

  it("converts a sync throw inside the factory into a retryable failure", async () => {
    let calls = 0;
    const [value, error] = await attemptRetry(
      () => {
        calls += 1;
        throw new Error("sync");
      },
      { attempts: 2, delay: 0 }
    );
    expect(value).toBeNull();
    expect(error).toEqual(new Error("sync"));
    expect(calls).toBe(2);
  });
});

describe("result utils additions", () => {
  it("maps only the error side and never touches a value", () => {
    expect(mapError(ok(1), () => "nope")).toEqual(ok(1));
    expect(mapError(err(new Error("x")), (error) => error.message)).toEqual({
      ok: false,
      error: "x",
    });
  });

  it("observes a result with tap on both branches", () => {
    const seen: string[] = [];
    tap(ok(1), { onSuccess: (value) => seen.push(`ok:${value}`) });
    tap(err(new Error("bad")), { onFailure: (error) => seen.push(`err:${error.message}`) });
    expect(seen).toEqual(["ok:1", "err:bad"]);
  });

  it("retries into a Result", async () => {
    let calls = 0;
    const result = await retry(
      async () => {
        calls += 1;
        if (calls < 2) throw new Error("flaky");
        return "ok";
      },
      { attempts: 3, delay: 0 }
    );
    expect(result).toEqual(ok("ok"));
    expect(calls).toBe(2);
  });

  it("fails with a timeout when the promise is too slow", async () => {
    const result = await withTimeout(
      new Promise((resolve) => setTimeout(() => resolve("late"), 50)),
      0
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toBe("Timed out after 0ms");
  });

  it("keeps a fast result past the timeout", async () => {
    const result = await withTimeout(Promise.resolve("fast"), 1000);
    expect(result).toEqual(ok("fast"));
  });

  it("does not leak an unhandled rejection when the timeout wins", async () => {
    const result = await withTimeout(Promise.reject(new Error("slow failure")), 0);
    expect(result.ok).toBe(false);
    // The losing promise rejects after the timeout already returned. Two
    // macrotask turns give the runtime the chance to report it as unhandled,
    // which fails this file, so reaching the assertion is the contract.
    await flush();
    await flush();
    expect(result.ok).toBe(false);
  });

  it("releases the resource after a successful use", async () => {
    const closed: string[] = [];
    const result = await withResource({
      acquire: () => "handle",
      use: (handle: string) => `${handle}!`,
      release: (handle: string) => {
        closed.push(handle);
      },
    });
    expect(result).toEqual(ok("handle!"));
    expect(closed).toEqual(["handle"]);
  });

  it("releases the resource when the use fails", async () => {
    const closed: string[] = [];
    const result = await withResource({
      acquire: () => "handle",
      use: () => Promise.reject(new Error("use failed")),
      release: () => {
        closed.push("handle");
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toBe("use failed");
    expect(closed).toEqual(["handle"]);
  });

  it("reports a release failure when the use succeeded", async () => {
    const result = await withResource({
      acquire: () => "handle",
      use: () => "value",
      release: () => {
        throw new Error("release failed");
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toBe("release failed");
  });

  it("never acquires use when acquire failed", async () => {
    let opened = 0;
    const result = await withResource({
      acquire: () => {
        opened += 1;
        throw new Error("no handle");
      },
      use: () => "never",
      release: () => {
        opened += 1;
      },
    });
    expect(result.ok).toBe(false);
    expect(opened).toBe(1);
  });

  it("settles every item with a concurrency limit", async () => {
    let inFlight = 0;
    let peak = 0;
    const results = await attemptAllLimit([1, 2, 3, 4, 5], 2, async (item) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await flush();
      inFlight -= 1;
      if (item === 3) throw new Error("bad item");
      return item * 10;
    });
    expect(results.map((result) => unwrapOr(result, -1))).toEqual([10, 20, -1, 40, 50]);
    expect(peak).toBe(2);
  });

  it("runs everything when the limit is larger than the list", async () => {
    const results = await attemptAllLimit(["a", "b"], 5, (item) => item.toUpperCase());
    expect(results).toEqual([ok("A"), ok("B")]);
  });

  it("keeps input order even when later items finish first", async () => {
    const results = await attemptAllLimit([30, 1], 2, async (delay) => {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return delay;
    });
    expect(results.map((result) => unwrapOr(result, -1))).toEqual([30, 1]);
  });

  it("bridges an attempt tuple into a Result", async () => {
    await expect(attemptResult(Promise.resolve(1))).resolves.toEqual(ok(1));
  });
});
