export type MigrationState = Record<string, unknown>;

export interface MigrationTransform {
  from?: number;
  migrate: (state: MigrationState) => void;
}

export function runTransforms(
  state: MigrationState,
  version: number,
  transforms: MigrationTransform[]
): MigrationState {
  for (const transform of transforms) {
    if (transform.from === undefined || version < transform.from) transform.migrate(state);
  }
  return state;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function cloneDefault(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneDefault);
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value)) out[key] = cloneDefault(value[key]);
    return out;
  }
  return value;
}

function resolveValue(persisted: unknown, fallback: unknown): unknown {
  if (Array.isArray(fallback)) return Array.isArray(persisted) ? [...persisted] : [...fallback];
  if (isPlainObject(fallback)) {
    if (!isPlainObject(persisted)) return cloneDefault(fallback);
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(fallback)) out[key] = resolveValue(persisted[key], fallback[key]);
    return out;
  }
  if (fallback === null || fallback === undefined)
    return persisted === undefined ? fallback : persisted;
  return typeof persisted === typeof fallback ? persisted : fallback;
}

export function resolveWithDefaults(
  persisted: MigrationState,
  defaults: MigrationState,
  validators: Record<string, (value: unknown) => boolean> = {}
): MigrationState {
  const resolved = resolveValue(persisted, defaults) as MigrationState;
  for (const key of Object.keys(validators)) {
    const validate = validators[key];
    if (validate && !validate(resolved[key])) resolved[key] = cloneDefault(defaults[key]);
  }
  return resolved;
}
