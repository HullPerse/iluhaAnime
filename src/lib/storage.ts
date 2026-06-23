const POS_QUEUE_KEY = "posQueue";
const MAX_POS = 50;

function getQueue(): string[] {
  try {
    return JSON.parse(localStorage.getItem(POS_QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveQueue(queue: string[]) {
  localStorage.setItem(POS_QUEUE_KEY, JSON.stringify(queue));
}

function touchQueue(path: string) {
  const queue = getQueue();
  const idx = queue.indexOf(path);
  if (idx >= 0) queue.splice(idx, 1);
  queue.unshift(path);
  while (queue.length > MAX_POS) {
    const removed = queue.pop()!;
    localStorage.removeItem(`pos:${removed}`);
    localStorage.removeItem(`track_audio:${removed}`);
    localStorage.removeItem(`track_sub:${removed}`);
    localStorage.removeItem(`sub_offset:${removed}`);
  }
  saveQueue(queue);
}

export function savePosition(path: string, time: number) {
  try {
    localStorage.setItem(`pos:${path}`, String(time));
    touchQueue(path);
  } catch {}
}

export function getPosition(path: string): number | undefined {
  try {
    const saved = localStorage.getItem(`pos:${path}`);
    return saved ? parseFloat(saved) : undefined;
  } catch {
    return undefined;
  }
}

export function saveTrackSelection(
  mediaPath: string,
  type: "audio" | "sub",
  index: number,
) {
  try {
    localStorage.setItem(`track_${type}:${mediaPath}`, String(index));
    touchQueue(mediaPath);
  } catch {}
}

export function getTrackSelection(
  mediaPath: string,
  type: "audio" | "sub",
): number | undefined {
  try {
    const saved = localStorage.getItem(`track_${type}:${mediaPath}`);
    return saved !== null ? parseInt(saved, 10) : undefined;
  } catch {
    return undefined;
  }
}

export function saveSubOffset(mediaPath: string, offset: number) {
  try {
    localStorage.setItem(`sub_offset:${mediaPath}`, String(offset));
  } catch {}
}

export function getSubOffset(mediaPath: string): number {
  try {
    const saved = localStorage.getItem(`sub_offset:${mediaPath}`);
    return saved ? parseFloat(saved) : 0;
  } catch {
    return 0;
  }
}

const SEARCH_HISTORY_KEY = "searchHistory";
const MAX_SEARCH_HISTORY = 5;

export function saveSearchQuery(query: string): void {
  try {
    const q = query.trim().toLowerCase();
    if (!q) return;
    const history = getSearchHistory();
    const filtered = history.filter((h) => h !== q);
    filtered.unshift(q);
    localStorage.setItem(
      SEARCH_HISTORY_KEY,
      JSON.stringify(filtered.slice(0, MAX_SEARCH_HISTORY)),
    );
  } catch {}
}

export function getSearchHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

export function removeSearchItem(query: string) {
  try {
    const history = getSearchHistory();
    const filtered = history.filter((h) => h !== query);
    const newHistory = [...filtered];

    localStorage.setItem(
      SEARCH_HISTORY_KEY,
      JSON.stringify(newHistory.slice(0, MAX_SEARCH_HISTORY)),
    );
  } catch {}
}
