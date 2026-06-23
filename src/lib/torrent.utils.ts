export function fmtSpeed(bps: number): string {
  if (bps <= 0) return "";
  if (bps < 1024) return `${bps.toFixed(0)} B/s`;
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
  return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
}

export function fmtETA(secs: number | null): string {
  if (!secs || secs <= 0 || !isFinite(secs)) return "";
  if (secs < 60) return `${Math.round(secs)} сек`;
  if (secs < 3600)
    return `${Math.floor(secs / 60)} мин ${Math.round(secs % 60)} сек`;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${h} ч ${m} мин`;
}

export function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function stateLabel(state: string): string {
  switch (state) {
    case "live":
      return "Загружается";
    case "paused":
      return "Пауза";
    case "initializing":
      return "Инициализация";
    case "error":
      return "Ошибка";
    default:
      return state;
  }
}

export interface FileGroup {
  dir: string;
  files: { index: number; name: string; displayName: string; size: number; completed?: boolean; selected?: boolean }[];
}

export function groupFilesByDirectory(files: { name: string; index: number; size: number; completed?: boolean; selected?: boolean }[]): FileGroup[] {
  const groups = new Map<string, FileGroup>();

  for (const file of files) {
    const idx = file.name.search(/[/\\]/);
    if (idx === -1) {
      const dir = "";
      if (!groups.has(dir)) groups.set(dir, { dir, files: [] });
      groups.get(dir)!.files.push({ ...file, displayName: file.name });
    } else {
      const dir = file.name.slice(0, idx);
      const displayName = file.name.slice(idx + 1);
      if (!groups.has(dir)) groups.set(dir, { dir, files: [] });
      groups.get(dir)!.files.push({ ...file, displayName });
    }
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => {
      if (a === "") return -1;
      if (b === "") return 1;
      return a.localeCompare(b);
    })
    .map(([_, group]) => ({
      ...group,
      files: group.files.sort((a, b) => a.displayName.localeCompare(b.displayName)),
    }));
}
