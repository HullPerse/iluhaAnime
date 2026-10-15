// Shared advanced TypeScript utility types for iluhaAnime.
// Type-only module: no runtime exports; runtime helpers live in
// src/lib/utils/type.utils.ts.

/** Flattens intersection types into a single object for better error display. */
export type Prettify<T> = {
  [K in keyof T]: T[K];
};

/**
 * Recursively makes every property optional.
 * Useful for filters, partial updates, and optional query params.
 */
export type DeepPartial<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

/**
 * Recursively makes every property readonly.
 * Useful for immutable snapshots and derived state.
 */
export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly unknown[]
    ? readonly DeepReadonly<T[number]>[]
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

/**
 * Recursively removes readonly modifiers.
 * Useful for building mutable versions of immutable data structures.
 */
export type Mutable<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly unknown[]
    ? Mutable<T[number]>[]
    : T extends object
      ? { -readonly [K in keyof T]: Mutable<T[K]> }
      : T;

/**
 * Brand a type with a unique symbol for nominal typing.
 * Prevents mixing concepts that share a runtime representation
 * (e.g. an AniList anime ID vs. a torrent tracker user ID).
 */
declare const BRAND_TAG: unique symbol;

export type Brand<T, Tag> = T & { readonly [BRAND_TAG]: Tag };

/**
 * Opaque type alias — same runtime shape, distinct compile-time identity.
 * Use for IDs and handles that must not leak between unrelated domains.
 */
export type Opaque<T, Tag extends string> = Brand<T, Tag>;

/** Branded AniList anime id. */
export type AniListId = Brand<number, "AniListId">;

/** Branded torrent info hash (40 hex chars). */
export type TorrentHash = Brand<string, "TorrentHash">;

/** Branded magnet link. */
export type MagnetLink = Brand<string, "MagnetLink">;

/** Branded file path on the host filesystem. */
export type FilePath = Brand<string, "FilePath">;

/**
 * Marks a switch as exhaustive at the type level.
 * Pair with `assertNever` at runtime for full safety.
 */
export type AssertNever = never;

/**
 * Exact type: rejects objects with unexpected extra properties.
 * Useful for API boundary validation where `extends` would be too permissive.
 */
export type Exact<T, Shape> = T extends Shape
  ? Exclude<keyof T, keyof Shape> extends never
    ? T
    : never
  : never;

/**
 * Exclusive-or: exactly one of A or B must be present, never both, never none.
 */
export type Without<T, U> = Partial<Record<Exclude<keyof T, keyof U>, never>>;
export type XOR<A, B> = (Without<A, B> & B) | (Without<B, A> & A);

/**
 * At least one property of T is set.
 * Useful for filter/search objects where every field is optional but not all are.
 */
export type AtLeastOne<T> = Partial<T> & { [K in keyof T]: Required<Pick<T, K>> }[keyof T];

/**
 * Exactly one property of T is set.
 */
export type ExactlyOne<T> = {
  [K in keyof T]: Required<Pick<T, K>> & Partial<Record<Exclude<keyof T, K>, never>>;
}[keyof T];

/**
 * Array with at least one element.
 * Rules out the empty-array case at the type level.
 */
export type NonEmptyArray<T> = [T, ...T[]];

/**
 * Type-safe event map for a typed emitter.
 * Maps event names to their argument tuple types.
 */
export type EventMap<Events> = {
  [K in keyof Events]: Events[K] extends readonly unknown[] ? Events[K] : [Events[K]];
};

/**
 * Mutable array variant of a readonly array.
 */
export type MutableArray<T> = T extends readonly unknown[] ? T[number][] : never;

/**
 * Extracts the element type of an array or readonly array.
 */
export type ArrayElement<T> = T extends readonly (infer U)[] ? U : never;
