import { describe, expect, it } from "vitest";

import { audioStage, canOpenAudioStage, shownAudioStage } from "@/lib/daily/stage.utils";

describe("audioStage", () => {
  it("unlocks one stage per attempt and stops on the last one", () => {
    expect(audioStage(0, 3)).toBe(0);
    expect(audioStage(1, 3)).toBe(1);
    expect(audioStage(2, 3)).toBe(2);
    expect(audioStage(3, 3)).toBe(2);
    expect(audioStage(5, 3)).toBe(2);
  });
});

describe("shownAudioStage", () => {
  it("keeps the automatic stage until the player picks one", () => {
    expect(shownAudioStage(2, null)).toBe(2);
  });

  it("allows revisiting a reached stage but not skipping ahead", () => {
    expect(shownAudioStage(2, 0)).toBe(0);
    expect(shownAudioStage(2, 1)).toBe(1);
    expect(shownAudioStage(2, 7)).toBe(2);
  });
});

describe("canOpenAudioStage", () => {
  it("allows the current stage and earlier ones only", () => {
    expect(canOpenAudioStage(0, 2)).toBe(true);
    expect(canOpenAudioStage(2, 2)).toBe(true);
    expect(canOpenAudioStage(3, 2)).toBe(false);
  });
});
