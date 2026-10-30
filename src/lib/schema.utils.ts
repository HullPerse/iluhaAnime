import * as z from "zod/mini";

import { attemptSync } from "@/lib/attempt.utils";
import { err, ok, type Result } from "@/lib/result.utils";

function issueText(parsed: {
  success: false;
  error: { issues: ReadonlyArray<{ path: PropertyKey[]; message: string }> };
}): string {
  const issue = parsed.error.issues[0];
  if (issue === undefined) return "Invalid value";
  const path = issue.path.map(String).join(".");
  return path.length > 0 ? `${path}: ${issue.message}` : issue.message;
}

export function parseValue<T>(value: unknown, schema: z.ZodMiniType<T>): Result<T> {
  const parsed = schema.safeParse(value);
  return parsed.success ? ok(parsed.data) : err(new Error(issueText(parsed)));
}

export function parseJson<T>(raw: string, schema: z.ZodMiniType<T>): Result<T> {
  const [value, parseError] = attemptSync(() => JSON.parse(raw) as unknown);
  return parseError === null ? parseValue(value, schema) : err(parseError);
}

export function toValidator<T>(schema: z.ZodMiniType<T>): (value: unknown) => boolean {
  return (value: unknown): boolean => schema.safeParse(value).success;
}

export function withFallback<TSchema extends z.ZodMiniType>(
  schema: TSchema,
  fallback: z.output<TSchema>
) {
  // oxlint-disable-next-line promise/valid-params -- zod `.catch(schema, fallback)`, not `Promise.catch`
  return z.catch(schema, fallback);
}
