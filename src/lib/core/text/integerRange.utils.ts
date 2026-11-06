export function isIntegerInRange(value: string, min: number, max: number): boolean {
  if (value.length === 0) return false;
  const parsed = Number(value);
  return /^\d+$/u.test(value) && Number.isInteger(parsed) && parsed >= min && parsed <= max;
}
