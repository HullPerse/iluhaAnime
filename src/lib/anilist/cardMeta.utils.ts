export function cardProgressLine(item: {
  progressTotal: number | null;
  progressValue: number;
  progressUnit: string;
}): string {
  if (item.progressTotal) return `${item.progressValue}/${item.progressTotal}`;
  if (item.progressValue > 0) return `${item.progressValue} ${item.progressUnit}`;
  return "";
}
