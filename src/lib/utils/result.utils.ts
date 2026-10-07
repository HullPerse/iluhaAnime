import { attempt, attemptSync, toError } from "@/lib/utils/attempt.utils";

export type Result<T> = { ok: true; value: T } | { ok: false; error: Error };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err(error: unknown): Result<never> {
  return { ok: false, error: toError(error) };
}

export async function attemptResult<T>(promise: Promise<T>): Promise<Result<T>> {
  const [value, error] = await attempt(promise);
  return error === null ? ok(value) : err(error);
}

export function attemptResultSync<T>(fn: () => T): Result<T> {
  const [value, error] = attemptSync(fn);
  return error === null ? ok(value) : err(error);
}

export function map<T, U>(result: Result<T>, fn: (value: T) => U): Result<U> {
  return result.ok ? ok(fn(result.value)) : result;
}

export async function andThen<T, U>(
  result: Result<T>,
  fn: (value: T) => Result<U> | Promise<Result<U>>
): Promise<Result<U>> {
  if (!result.ok) return result;
  const [value, error] = await attempt(Promise.resolve().then(() => fn(result.value)));
  return error === null ? value : err(error);
}

export function unwrapOr<T, F>(result: Result<T>, fallback: F): T | F {
  return result.ok ? result.value : fallback;
}
