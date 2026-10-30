export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

export interface TapHandlers<T, E> {
  onSuccess?: (value: T) => void;
  onFailure?: (error: E) => void;
}

export interface ResourceUse<T, R> {
  acquire: () => T | Promise<T>;
  use: (resource: T) => R | Promise<R>;
  release: (resource: T) => void | Promise<void>;
}
