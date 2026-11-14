import {
  catch as catchSchema,
  type output,
  type ZodMiniType,
} from "zod/mini";

import { attemptSync } from "@hullperse/hp_utils/attempt";
import { err, ok } from "@hullperse/hp_utils/result";
import type { Result } from "@/types/core/result";

function issueText(parsed: {
  success: false;
  error: { issues: ReadonlyArray<{ path: PropertyKey[]; message: string }> };
}): string {
  const issue = parsed.error.issues[0];
  if (issue === undefined) return "Invalid value";
  const path = issue.path.map(String).join(".");
  return path.length > 0 ? `${path}: ${issue.message}` : issue.message;
}

export function parseValue<T>(value: unknown, schema: ZodMiniType<T>): Result<T> {
  const parsed = schema.safeParse(value);
  return parsed.success ? ok(parsed.data) : err(new Error(issueText(parsed)));
}

export function parseJson<T>(raw: string, schema: ZodMiniType<T>): Result<T> {
  const [value, parseError] = attemptSync((): unknown => JSON.parse(raw));
  return parseError === null ? parseValue(value, schema) : err(parseError);
}

export function toValidator<T>(schema: ZodMiniType<T>): (value: unknown) => boolean {
  return (value: unknown): boolean => schema.safeParse(value).success;
}

export function withFallback<TSchema extends ZodMiniType>(
  schema: TSchema,
  fallback: output<TSchema>
) {
  return catchSchema(schema, fallback);
}
