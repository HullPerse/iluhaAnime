import type { MpvChapter } from "@/types/videoPlayer";

export const SKIP_AUTO_HIDE_MS = 8000;
export const SKIP_SEEK_BACK_THRESHOLD = 2;

export interface ActiveChapter {
  chapter: MpvChapter;
  index: number;
  target: number;
}

const OP_PATTERN = /\b(?:opening|op(?:[\s_-]*\d+)?)\b/;
const ED_PATTERN = /\b(?:ending|ed(?:[\s_-]*\d+)?)\b/;
export const SKIP_MIN_SECONDS = 20;

function isOpeningTitle(lower: string): boolean {
  return OP_PATTERN.test(lower) || lower.includes("опенинг") || lower.includes("заставка");
}

function isEndingTitle(lower: string): boolean {
  return (
    ED_PATTERN.test(lower) ||
    lower.includes("credits") ||
    lower.includes("эндинг") ||
    lower.includes("концовка") ||
    lower.includes("титры")
  );
}

function isIntroTitle(lower: string): boolean {
  return lower.includes("intro") || lower.includes("интро") || lower.includes("вступление");
}

function isPreviewTitle(lower: string): boolean {
  return (
    lower.includes("preview") ||
    lower.includes("next episode") ||
    lower.includes("next time") ||
    lower.includes("next week") ||
    lower.includes("превью") ||
    lower.includes("анонс") ||
    lower.includes("следующ")
  );
}

function isIntermissionTitle(lower: string): boolean {
  return (
    lower.includes("intermission") ||
    lower.includes("interlude") ||
    lower.includes("interval") ||
    lower.includes("перерыв") ||
    lower.includes("антракт")
  );
}

function isRecapTitle(lower: string): boolean {
  return lower.includes("recap") || lower.includes("рекап") || lower.includes("ранее");
}

export function skipLabel(title: string): string | null {
  const lower = title.toLowerCase();
  if (isOpeningTitle(lower)) return "OP";
  if (isEndingTitle(lower)) return "ED";
  if (isIntroTitle(lower)) return "Intro";
  if (isPreviewTitle(lower)) return "Preview";
  if (isIntermissionTitle(lower)) return "Intermission";
  if (isRecapTitle(lower)) return "Recap";
  return null;
}

export function findActiveChapter(
  chapters: MpvChapter[],
  timePos: number,
  duration: number
): ActiveChapter | null {
  for (let i = 0; i < chapters.length; i += 1) {
    const chapter = chapters[i];
    const start = chapter.time;
    const end = chapter.end ?? chapters[i + 1]?.time ?? duration;
    if (timePos >= start && timePos < end) {
      return { chapter, index: i, target: chapter.end ?? chapters[i + 1]?.time ?? duration };
    }
  }
  return null;
}
