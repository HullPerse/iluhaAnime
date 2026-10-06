import { describe, expect, it } from "vitest";

import { findActiveChapter, skipLabel } from "@/lib/player/skip.utils";
import type { MpvChapter } from "@/types/videoPlayer";

function chapter(title: string, time: number, end?: number): MpvChapter {
  return end === undefined ? { title, time } : { title, time, end };
}

describe("player/skip label", () => {
  it("matches english opening and ending titles", () => {
    expect(skipLabel("Opening")).toBe("OP");
    expect(skipLabel("OP")).toBe("OP");
    expect(skipLabel("Ending")).toBe("ED");
    expect(skipLabel("ED")).toBe("ED");
    expect(skipLabel("Credits")).toBe("ED");
  });

  it("matches english intro, preview, intermission, and recap titles", () => {
    expect(skipLabel("Intro")).toBe("Intro");
    expect(skipLabel("Preview")).toBe("Preview");
    expect(skipLabel("Next Episode")).toBe("Preview");
    expect(skipLabel("Intermission")).toBe("Intermission");
    expect(skipLabel("Recap")).toBe("Recap");
  });

  it("matches russian chapter titles", () => {
    expect(skipLabel("Опенинг")).toBe("OP");
    expect(skipLabel("Заставка")).toBe("OP");
    expect(skipLabel("Эндинг")).toBe("ED");
    expect(skipLabel("Концовка")).toBe("ED");
    expect(skipLabel("Титры")).toBe("ED");
    expect(skipLabel("Интро")).toBe("Intro");
    expect(skipLabel("Превью")).toBe("Preview");
    expect(skipLabel("Анонс")).toBe("Preview");
    expect(skipLabel("Следующая серия")).toBe("Preview");
    expect(skipLabel("Перерыв")).toBe("Intermission");
    expect(skipLabel("Рекап")).toBe("Recap");
  });

  it("returns null for regular chapters", () => {
    expect(skipLabel("Chapter 1")).toBeNull();
    expect(skipLabel("Глава 2")).toBeNull();
    expect(skipLabel("")).toBeNull();
  });
});

describe("player/skip active chapter", () => {
  const chapters = [chapter("Opening", 0, 90), chapter("Main", 90), chapter("Ending", 1300)];

  it("finds the chapter holding the current position", () => {
    expect(findActiveChapter(chapters, 10, 1400)?.index).toBe(0);
    expect(findActiveChapter(chapters, 100, 1400)?.index).toBe(1);
    expect(findActiveChapter(chapters, 1350, 1400)?.index).toBe(2);
  });

  it("treats chapter start as inclusive and chapter end as exclusive", () => {
    expect(findActiveChapter(chapters, 0, 1400)?.index).toBe(0);
    expect(findActiveChapter(chapters, 90, 1400)?.index).toBe(1);
  });

  it("falls back to the next chapter start and duration for the target", () => {
    expect(findActiveChapter(chapters, 10, 1400)?.target).toBe(90);
    expect(findActiveChapter(chapters, 100, 1400)?.target).toBe(1300);
    expect(findActiveChapter(chapters, 1350, 1400)?.target).toBe(1400);
  });

  it("returns null outside every chapter", () => {
    expect(findActiveChapter(chapters, 1400, 1400)).toBeNull();
    expect(findActiveChapter([], 10, 1400)).toBeNull();
  });
});
