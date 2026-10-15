
export type Prettify<T> = {
  [K in keyof T]: T[K];
};

export type DeepPartial<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly unknown[]
    ? readonly DeepReadonly<T[number]>[]
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

export type Mutable<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly unknown[]
    ? Mutable<T[number]>[]
    : T extends object
      ? { -readonly [K in keyof T]: Mutable<T[K]> }
      : T;

declare const BRAND_TAG: unique symbol;

export type Brand<T, Tag> = T & { readonly [BRAND_TAG]: Tag };

export type Opaque<T, Tag extends string> = Brand<T, Tag>;

export type AniListId = Brand<number, "AniListId">;

export type TorrentHash = Brand<string, "TorrentHash">;

export type MagnetLink = Brand<string, "MagnetLink">;

export type FilePath = Brand<string, "FilePath">;

export type AssertNever = never;

export type Exact<T, Shape> = T extends Shape
  ? Exclude<keyof T, keyof Shape> extends never
    ? T
    : never
  : never;

export type Without<T, U> = Partial<Record<Exclude<keyof T, keyof U>, never>>;
export type XOR<A, B> = (Without<A, B> & B) | (Without<B, A> & A);

export type AtLeastOne<T> = Partial<T> & { [K in keyof T]: Required<Pick<T, K>> }[keyof T];

export type ExactlyOne<T> = {
  [K in keyof T]: Required<Pick<T, K>> & Partial<Record<Exclude<keyof T, K>, never>>;
}[keyof T];

export type NonEmptyArray<T> = [T, ...T[]];

export type EventMap<Events> = {
  [K in keyof Events]: Events[K] extends readonly unknown[] ? Events[K] : [Events[K]];
};

export type MutableArray<T> = T extends readonly unknown[] ? T[number][] : never;

export type ArrayElement<T> = T extends readonly (infer U)[] ? U : never;
