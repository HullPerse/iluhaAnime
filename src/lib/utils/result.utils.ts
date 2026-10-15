import { normalizeWait, scheduleTask, type ScheduledTask } from "@/lib/pacer/shared.utils";
import {
  attempt,
  attemptRetry,
  attemptSync,
  toError,
  type RetryOptions,
} from "@/lib/utils/attempt.utils";

export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

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

function toResult<T>(outcome: [T, null] | [null, Error]): Result<T> {
  const [value, error] = outcome;
  return error === null ? ok(value) : err(error);
}

export function map<T, U>(result: Result<T>, fn: (value: T) => U): Result<U> {
  return result.ok ? ok(fn(result.value)) : result;
}

export function mapError<T, E, F>(result: Result<T, E>, mapError: (error: E) => F): Result<T, F> {
  return result.ok ? result : { ok: false, error: mapError(result.error) };
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

export interface TapHandlers<T, E> {
  onSuccess?: (value: T) => void;
  onFailure?: (error: E) => void;
}

export function tap<T, E>(result: Result<T, E>, handlers: TapHandlers<T, E>): Result<T, E> {
  if (result.ok) handlers.onSuccess?.(result.value);
  else handlers.onFailure?.(result.error);
  return result;
}

export async function retry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<Result<T>> {
  return toResult(await attemptRetry(fn, options));
}

const TIMEOUT_MARK = Symbol("result.withTimeout");

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message?: string
): Promise<Result<T>> {
  const timeout = normalizeWait(ms);
  let timer: ScheduledTask | undefined;
  const expired = new Promise<typeof TIMEOUT_MARK>((resolve) => {
    timer = scheduleTask("timeout", timeout, () => resolve(TIMEOUT_MARK));
  });
  const outcome = await Promise.race([attempt(promise), expired]);
  timer?.cancel();
  if (outcome === TIMEOUT_MARK) {
    return err(new Error(message ?? `Timed out after ${timeout}ms`));
  }
  return toResult(outcome);
}

export interface ResourceUse<T, R> {
  acquire: () => T | Promise<T>;
  use: (resource: T) => R | Promise<R>;
  release: (resource: T) => void | Promise<void>;
}

function runResourceUse<T, R>(steps: ResourceUse<T, R>, resource: T): Promise<Result<R>> {
  return attemptResult((async () => steps.use(resource))()).then((used): Promise<Result<R>> => {
    const settle = (releaseError: Error | null): Result<R> => {
      if (!used.ok) return used;
      return releaseError === null ? used : err(releaseError);
    };
    return releaseQuietly(steps, resource).then(settle);
  });
}

function releaseQuietly<T>(steps: ResourceUse<T, unknown>, resource: T): Promise<Error | null> {
  return attempt((async () => steps.release(resource))()).then(([, error]) => error);
}

export async function withResource<T, R>(steps: ResourceUse<T, R>): Promise<Result<R>> {
  const resource = await attemptResult((async () => steps.acquire())());
  if (!resource.ok) return resource;
  return runResourceUse(steps, resource.value);
}

export async function attemptAllLimit<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R> | R
): Promise<Array<Result<R>>> {
  const results: Array<Result<R>> = [];
  let cursor = 0;
  const workers = Math.min(Math.max(1, Math.floor(limit)), Math.max(items.length, 1));
  const run = async (): Promise<void> => {
    for (;;) {
      if (cursor >= items.length) return;
      const index = cursor;
      cursor += 1;
      results[index] = await attemptResult((async () => task(items[index], index))());
    }
  };
  await Promise.all(Array.from({ length: workers }, () => run()));
  return results;
}
