export function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

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
