import {
  TAG_DEFAULT_VALUE_BY_KEY,
  TAG_EXAMPLE_BY_KEY,
  TAG_NUMERIC_SET,
  TAG_OPS_BY_KEY,
} from "@/config/graphics/tags.config";

export function exampleFor(key: string): string {
  if (TAG_NUMERIC_SET.has(key)) return `${key}>=${TAG_DEFAULT_VALUE_BY_KEY[key] ?? "12"}`;
  return TAG_EXAMPLE_BY_KEY[key] ?? `${key}=action|drama`;
}

export function opsFor(key: string): string {
  if (TAG_NUMERIC_SET.has(key)) return "=, ~=, !=, >, <, >=, <=";
  return TAG_OPS_BY_KEY[key] ?? "=, !=";
}
