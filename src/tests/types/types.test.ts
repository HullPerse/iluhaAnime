import { describe, expect, expectTypeOf, it } from "vitest";

import { assertNever } from "@hullperse/hp_utils/type";
import type {
  AniListId,
  ArrayElement,
  AssertNever,
  AtLeastOne,
  Brand,
  DeepPartial,
  DeepReadonly,
  EventMap,
  Exact,
  ExactlyOne,
  FilePath,
  MagnetLink,
  Mutable,
  MutableArray,
  NonEmptyArray,
  Opaque,
  Prettify,
  TorrentHash,
  XOR,
} from "@/types/core/types";

interface XorA {
  a: string;
}

interface XorB {
  b: number;
}

interface SearchShape {
  q?: string;
  tag?: string;
}

interface NestedShape {
  a: { b: string };
  list: number[];
  fn: () => void;
}

interface AppEvents {
  open: [id: number];
  close: [];
}

function takeXor(_value: XOR<XorA, XorB>): void {}

function takeFilter(_value: AtLeastOne<SearchShape>): void {}

function takeOne(_value: ExactlyOne<SearchShape>): void {}

function takeNonEmpty(_value: NonEmptyArray<string>): void {}
type Rejects<Fn extends (...args: never[]) => unknown, Arg> = Arg extends Parameters<Fn>[0]
  ? false
  : true;

type NoXorSide = { a?: never; b?: never };
type NoFilterKey = { q?: never; tag?: never };

describe("types/utils", () => {
  it("throws on unreachable values", () => {
    expect(() => assertNever("oops" as never)).toThrow("Unexpected value: oops");
  });

  it("pins the never alias used by exhaustive checks", () => {
    expectTypeOf<AssertNever>().toEqualTypeOf<never>();
  });

  it("keeps branded ids distinct from plain primitives", () => {
    const anime = 21 as AniListId;
    const hash = "abc" as TorrentHash;
    const magnet = "magnet:?xt=1" as MagnetLink;
    const file = "/tmp/x" as FilePath;
    expectTypeOf(anime).toEqualTypeOf<Brand<number, "AniListId">>();
    expectTypeOf(anime).not.toEqualTypeOf<number>();
    expectTypeOf(hash).not.toEqualTypeOf<string>();
    expectTypeOf(hash).not.toEqualTypeOf<MagnetLink>();
    expectTypeOf(magnet).not.toEqualTypeOf<FilePath>();
    expectTypeOf(file).not.toEqualTypeOf<string>();
    expectTypeOf<number>().not.toMatchTypeOf<AniListId>();
    expectTypeOf<string>().not.toMatchTypeOf<TorrentHash>();
  });

  it("pins the opaque alias to its brand", () => {
    expectTypeOf<Opaque<string, "Token">>().toEqualTypeOf<Brand<string, "Token">>();
  });

  it("flattens intersections for display", () => {
    expectTypeOf<Prettify<{ a: string } & { b: number }>>().toEqualTypeOf<{
      a: string;
      b: number;
    }>();
  });

  it("allows deep partial updates and keeps functions intact", () => {
    const partial: DeepPartial<NestedShape> = { a: {} };
    expectTypeOf(partial.a).toEqualTypeOf<{ b?: string } | undefined>();
    expectTypeOf<DeepPartial<() => void>>().toEqualTypeOf<() => void>();
  });

  it("freezes nested graphs and thaws readonly inputs", () => {
    expectTypeOf<DeepReadonly<NestedShape>>().toMatchTypeOf<{
      readonly a: { readonly b: string };
      readonly list: readonly number[];
    }>();
    const thawed: Mutable<readonly [1, 2]> = [1, 2];
    thawed.push(1);
    expectTypeOf(thawed).toMatchTypeOf<number[]>();
  });

  it("accepts exact shapes and rejects excess keys", () => {
    expectTypeOf<Exact<{ a: number }, { a: number }>>().toEqualTypeOf<{ a: number }>();
    expectTypeOf<Exact<{ a: number; b: string }, { a: number }>>().toEqualTypeOf<never>();
  });

  it("accepts exactly one side of an exclusive union", () => {
    takeXor({ a: "x" });
    takeXor({ b: 1 });
    expectTypeOf<Rejects<typeof takeXor, { a: string; b: number }>>().toEqualTypeOf<true>();
    expectTypeOf<Rejects<typeof takeXor, NoXorSide>>().toEqualTypeOf<true>();
  });

  it("requires at least one filter key", () => {
    takeFilter({ q: "x" });
    takeFilter({ q: "x", tag: "y" });
    expectTypeOf<Rejects<typeof takeFilter, NoFilterKey>>().toEqualTypeOf<true>();
  });

  it("requires exactly one key", () => {
    takeOne({ q: "x" });
    expectTypeOf<Rejects<typeof takeOne, SearchShape>>().toEqualTypeOf<true>();
    expectTypeOf<Rejects<typeof takeOne, NoFilterKey>>().toEqualTypeOf<true>();
  });

  it("rejects empty arrays where one element is required", () => {
    takeNonEmpty(["a"]);
    expectTypeOf<Rejects<typeof takeNonEmpty, []>>().toEqualTypeOf<true>();
  });

  it("pins event maps and array helpers", () => {
    expectTypeOf<EventMap<AppEvents>>().toMatchTypeOf<AppEvents>();
    expectTypeOf<MutableArray<readonly string[]>>().toEqualTypeOf<string[]>();
    expectTypeOf<ArrayElement<readonly [number, string]>>().toEqualTypeOf<number | string>();
  });
});
