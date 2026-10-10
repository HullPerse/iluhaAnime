import { describe, expect, it } from "vitest";

import {
  needsExactSeek,
  resolveLoadPosition,
  shouldSkipFrontendSeek,
  type HwdecReload,
} from "@/lib/player/resume.utils";

const RELOAD: HwdecReload = { position: 321, paused: true };

describe("resolveLoadPosition", () => {
  it("prefers the hwdec reload position over everything", () => {
    expect(resolveLoadPosition(RELOAD, 100, 200)).toBe(321);
    expect(resolveLoadPosition(RELOAD, undefined, undefined)).toBe(321);
  });

  it("uses the open-request resume for the entry the player started on", () => {
    expect(resolveLoadPosition(null, 100, 200)).toBe(100);
    expect(resolveLoadPosition(null, 100, undefined)).toBe(100);
    expect(resolveLoadPosition(null, 0, 200)).toBe(0);
  });

  it("falls back to the persisted watch position for later entries", () => {
    expect(resolveLoadPosition(null, undefined, 200)).toBe(200);
  });

  it("starts from zero without any stored position", () => {
    expect(resolveLoadPosition(null, undefined, undefined)).toBe(0);
  });
});

describe("needsExactSeek", () => {
  it("seeks on hwdec reload past one second", () => {
    expect(needsExactSeek(RELOAD, 50, false)).toBe(true);
    expect(needsExactSeek({ position: 0.5, paused: true }, 0.5, true)).toBe(false);
  });

  it("seeks only inside the watchable range otherwise", () => {
    expect(needsExactSeek(null, 100, true)).toBe(true);
    expect(needsExactSeek(null, 100, false)).toBe(false);
  });
});

describe("shouldSkipFrontendSeek", () => {
  it("skips the redundant seek when the backend already started at resume", () => {
    expect(shouldSkipFrontendSeek(null, 100, 100)).toBe(true);
  });

  it("seeks when the backend started at zero (no resume in the open request)", () => {
    expect(shouldSkipFrontendSeek(null, undefined, 200)).toBe(false);
  });

  it("seeks when the resolved position differs from the requested resume", () => {
    expect(shouldSkipFrontendSeek(null, 100, 200)).toBe(false);
  });

  it("never skips hwdec reloads (no backend start= there)", () => {
    expect(shouldSkipFrontendSeek(RELOAD, 100, 100)).toBe(false);
  });

  it("never skips a zero resume (backend start= applies only above zero)", () => {
    expect(shouldSkipFrontendSeek(null, 0, 0)).toBe(false);
  });
});
