export function formatFps(value: number | undefined): string {
  return value === undefined ? "-" : `${value.toFixed(1)} fps`;
}

export function formatCount(value: number | undefined): string {
  return value === undefined ? "-" : `${value}`;
}

export function formatCache(value: number | undefined): string {
  return value === undefined ? "-" : `${value.toFixed(1)}s`;
}
