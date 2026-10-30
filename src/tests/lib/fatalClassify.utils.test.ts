import { describe, expect, it } from "vitest";

import {
  GLOBAL_ESCALATE_COUNT,
  GLOBAL_ESCALATE_WINDOW_MS,
  isChunkError,
  isResizeObserverLoopError,
  noteGlobalError,
  resetGlobalErrors,
  shouldEscalateGlobal,
  toFatalInfo,
} from "@/lib/core/fatalClassify.utils";

describe("fatal classify contract", () => {
  it("marks plain render failures as render kind with context", () => {
    const info = toFatalInfo(new Error("boom"), {
      scope: "render",
      route: "/collection",
      themeName: "xp",
      timestamp: 1000,
    });
    expect(info.kind).toBe("render");
    expect(info.message).toBe("boom");
    expect(info.scope).toBe("render");
    expect(info.route).toBe("/collection");
    expect(info.themeName).toBe("xp");
    expect(info.timestamp).toBe(1000);
    expect(info.retryCount).toBe(0);
    expect(info.stack).toContain("boom");
  });

  it("detects chunk failures by name, code, and message", () => {
    const byName = { name: "ChunkLoadError", message: "x" };
    const byCode = { code: "CHUNK_LOAD_FAILED", message: "x" };
    const byMessage = new Error("Failed to fetch dynamically imported module: ./x.js");
    expect(isChunkError(byName)).toBe(true);
    expect(isChunkError(byCode)).toBe(true);
    expect(isChunkError(byMessage)).toBe(true);
    expect(isChunkError(new Error("plain render boom"))).toBe(false);
    expect(toFatalInfo(byMessage, { scope: "render" }).kind).toBe("chunk");
  });

  it("ignores the benign ResizeObserver loop warning", () => {
    expect(
      isResizeObserverLoopError("ResizeObserver loop completed with undelivered notifications.")
    ).toBe(true);
    expect(isResizeObserverLoopError(new Error("ResizeObserver loop limit exceeded"))).toBe(true);
    expect(isResizeObserverLoopError(new Error("render boom"))).toBe(false);
    expect(isResizeObserverLoopError(null)).toBe(false);
    expect(isResizeObserverLoopError(undefined)).toBe(false);
  });

  it("keeps startup and global-loop scopes over heuristics", () => {
    expect(toFatalInfo(new Error("x"), { scope: "startup" }).kind).toBe("startup");
    expect(toFatalInfo(new Error("x"), { scope: "global-loop" }).kind).toBe("global-loop");
  });

  it("normalizes non-Error values into a message", () => {
    expect(toFatalInfo("plain string", { scope: "render" }).message).toBe("plain string");
    expect(toFatalInfo(undefined, { scope: "render" }).message).toBe("undefined");
  });

  it("escalates only after enough global errors inside the window", () => {
    expect(shouldEscalateGlobal([0, 1000], 2000)).toBe(false);
    expect(shouldEscalateGlobal([0, 5000, 9000], 9001)).toBe(true);
    expect(shouldEscalateGlobal([0, 1, 2], GLOBAL_ESCALATE_WINDOW_MS + 10)).toBe(false);
    expect(GLOBAL_ESCALATE_COUNT).toBe(3);
  });

  it("counts global errors through the module singleton and resets", () => {
    resetGlobalErrors();
    expect(noteGlobalError(0)).toBe(false);
    expect(noteGlobalError(1000)).toBe(false);
    expect(noteGlobalError(2000)).toBe(true);
    resetGlobalErrors();
    expect(noteGlobalError(3000)).toBe(false);
    resetGlobalErrors();
  });
});
