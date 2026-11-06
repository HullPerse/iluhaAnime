export function formatBackupDate(ms: number): string {
  if (ms <= 0) return "-";
  return new Date(ms).toLocaleString();
}
