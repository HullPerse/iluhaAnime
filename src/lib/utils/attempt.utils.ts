import { MAX_TIMEOUT_MS } from "@/lib/pacer/shared.utils";

export function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

export async function attempt<T>(promise: Promise<T>): Promise<[T, null] | [null, Error]> {
  try {
    return [await promise, null];
  } catch (error) {
    return [null, toError(error)];
  }
}

export function attemptSync<T>(fn: () => T): [T, null] | [null, Error] {
  try {
    return [fn(), null];
  } catch (error) {
    return [null, toError(error)];
  }
}

export interface AttemptAllOptions {
  onFinally?: () => unknown;
}

export async function attemptAll(
  steps: ReadonlyArray<() => unknown>,
  options: AttemptAllOptions = {}
): Promise<Error | null> {
  let failure: Error | null = null;
  try {
    for (const step of steps) {
      await step();
    }
  } catch (error) {
    failure = toError(error);
  }
  if (options.onFinally !== undefined) {
    try {
      await options.onFinally();
    } catch (error) {
      if (failure === null) failure = toError(error);
    }
  }
  return failure;
}

export async function withFallback<T>(promise: Promise<T>, fallback: T): Promise<T> {
  const [data, error] = await attempt(promise);
  return error ? fallback : data;
}

export interface RetryOptions {
  attempts?: number;
  delay?: number;
  backoff?: number;
  maxDelay?: number;
  signal?: AbortSignal;
  shouldRetry?: (error: Error, attempt: number) => boolean;
}

const RETRY_DEFAULTS = { attempts: 3, delay: 200, backoff: 2 } as const;

function runTask<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return fn();
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }
}

function abortError(signal?: AbortSignal): Error {
  const reason: unknown = signal?.reason;
  if (reason instanceof Error) return reason;
  return new Error("Aborted");
}

function sleep(ms: number, signal?: AbortSignal): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    if (signal?.aborted) {
      resolve(true);
      return;
    }
    const timer = setTimeout(
      () => {
        signal?.removeEventListener("abort", onAbort);
        resolve(false);
      },
      Math.min(Math.max(0, ms), MAX_TIMEOUT_MS)
    );
    function onAbort(): void {
      clearTimeout(timer);
      resolve(true);
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Runs a promise factory and maps the rejection into a typed failure.
 * Used where the caller owns the domain error shape and the raw `Error`
 * from `attempt` would lose the cause.
 */
export async function attemptAs<T, E>(
  promise: Promise<T>,
  mapError: (error: unknown) => E
): Promise<[T, null] | [null, E]> {
  try {
    return [await promise, null];
  } catch (error) {
    return [null, mapError(error)];
  }
}

export function attemptAsSync<T, E>(
  fn: () => T,
  mapError: (error: unknown) => E
): [T, null] | [null, E] {
  try {
    return [fn(), null];
  } catch (error) {
    return [null, mapError(error)];
  }
}

/**
 * Retries `fn` with a growing delay. The first call is attempt 1, so
 * `attempts: 3` means one call plus two retries. A delay of 0 keeps the
 * retries immediate, which is what tests want.
 */
export async function attemptRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<[T, null] | [null, Error]> {
  const attempts = Math.max(1, Math.floor(options.attempts ?? RETRY_DEFAULTS.attempts));
  const backoff = options.backoff ?? RETRY_DEFAULTS.backoff;
  const maxDelay = options.maxDelay ?? MAX_TIMEOUT_MS;
  const { signal, shouldRetry } = options;
  let delay = options.delay ?? RETRY_DEFAULTS.delay;
  for (let attemptIndex = 1; ; attemptIndex += 1) {
    if (signal?.aborted) return [null, abortError(signal)];
    const [value, error] = await attempt(runTask(fn));
    if (error === null) return [value, null];
    if (attemptIndex >= attempts) return [null, error];
    if (shouldRetry !== undefined && !shouldRetry(error, attemptIndex)) return [null, error];
    if (await sleep(delay, signal)) return [null, abortError(signal)];
    delay = Math.min(Math.max(0, delay * backoff), maxDelay);
  }
}

export function reportBackgroundError(scope: string, error: unknown): void {
  console.warn(`background task failed: ${scope}`, error);
}
