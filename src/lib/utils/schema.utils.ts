import * as z from "zod/mini";

import { attemptSync } from "@/lib/utils/attempt.utils";
import { err, ok, type Result } from "@/lib/utils/result.utils";

function issueText(parsed: {
  success: false;
  error: { issues: ReadonlyArray<{ path: PropertyKey[]; message: string }> };
}): string {
  const issue = parsed.error.issues[0];
  if (issue === undefined) return "Invalid value";
  const path = issue.path.map(String).join(".");
  return path.length > 0 ? `${path}: ${issue.message}` : issue.message;
}

/** Parses an already decoded value and reports the failing path on failure. */
export function parseValue<T>(value: unknown, schema: z.ZodMiniType<T>): Result<T> {
  const parsed = schema.safeParse(value);
  return parsed.success ? ok(parsed.data) : err(new Error(issueText(parsed)));
}

/** Parses JSON text, so a malformed payload and a wrong shape fail differently. */
export function parseJson<T>(raw: string, schema: z.ZodMiniType<T>): Result<T> {
  const [value, parseError] = attemptSync(() => JSON.parse(raw) as unknown);
  return parseError === null ? parseValue(value, schema) : err(parseError);
}

/** Adapts a schema to the validator shape consumed by resolveWithDefaults. */
export function toValidator<T>(schema: z.ZodMiniType<T>): (value: unknown) => boolean {
  return (value: unknown): boolean => schema.safeParse(value).success;
}
