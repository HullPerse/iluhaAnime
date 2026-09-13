import { TAG_EXAMPLE_BY_KEY, TAG_NUMERIC_SET } from "@/config/collection/tags.config";

export function exampleFor(key: string): string {
  if (TAG_NUMERIC_SET.has(key))
    return `${key}>=${key === "rating" ? "8" : key === "year" ? "2000" : "12"}`;
  if (key === "sort") return "sort=rating:desc";
  if (key === "date") return 'date="31.01.2025"';
  return TAG_EXAMPLE_BY_KEY[key] ?? `${key}=action|drama`;
}

export function opsFor(key: string): string {
  if (TAG_NUMERIC_SET.has(key)) return "=, ~=, !=, >, <, >=, <=";
  if (key === "sort") return "=";
  if (key === "date") return "=, !=, >, <, >=, <=";
  return "=, !=";
}
