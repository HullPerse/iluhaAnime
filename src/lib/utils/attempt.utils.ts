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

export async function withFallback<T>(promise: Promise<T>, fallback: T): Promise<T> {
  const [data, error] = await attempt(promise);
  return error ? fallback : data;
}

export function reportBackgroundError(scope: string, error: unknown): void {
  console.warn(`background task failed: ${scope}`, error);
}
