export function ignore(promise: Promise<unknown>): void {
  promise.catch(() => undefined);
}
