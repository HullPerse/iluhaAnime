import { describe, expect, expectTypeOf, it } from "vitest";

import { assertNever } from "@/lib/core/type.utils";
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
    expect(anime).toBe(21);
    expect(hash).toBe("abc");
    expect(file).toBe("/tmp/x");
    const raw = 21;
    // @ts-expect-error - plain numbers must not flow into branded ids
    const branded: AniListId = raw;
    expect(branded).toBe(21);
  });

  it("pins the opaque alias to its brand", () => {
    expectTypeOf<Opaque<string, "Token">>().toEqualTypeOf<Brand<string, "Token">>();
  });

  it("flattens intersections for display", () => {
    const flat: Prettify<{ a: string } & { b: number }> = { a: "x", b: 1 };
    expect(flat.a).toBe("x");
  });

  it("allows deep partial updates and keeps functions intact", () => {
    const partial: DeepPartial<NestedShape> = { a: {} };
    expect(partial.a).toEqual({});
    expectTypeOf<DeepPartial<() => void>>().toEqualTypeOf<() => void>();
  });

  it("freezes nested graphs and thaws readonly inputs", () => {
    const frozen: DeepReadonly<NestedShape> = { a: { b: "x" }, list: [1], fn: () => {} };
    expect(frozen.a.b).toBe("x");
    const thawed: Mutable<readonly [1, 2]> = [1, 2];
    thawed.push(1);
    expect(thawed).toEqual([1, 2, 1]);
  });

  it("accepts exact shapes and rejects excess keys", () => {
    expectTypeOf<Exact<{ a: number }, { a: number }>>().toEqualTypeOf<{ a: number }>();
    expectTypeOf<Exact<{ a: number; b: string }, { a: number }>>().toEqualTypeOf<never>();
  });

  it("accepts exactly one side of an exclusive union", () => {
    takeXor({ a: "x" });
    takeXor({ b: 1 });
    // @ts-expect-error - both sides set
    takeXor({ a: "x", b: 1 });
    // @ts-expect-error - neither side set
    takeXor({});
  });

  it("requires at least one filter key", () => {
    takeFilter({ q: "x" });
    takeFilter({ q: "x", tag: "y" });
    // @ts-expect-error - empty filter matches nothing
    takeFilter({});
  });

  it("requires exactly one key", () => {
    takeOne({ q: "x" });
    // @ts-expect-error - two keys set
    takeOne({ q: "x", tag: "y" });
    // @ts-expect-error - no key set
    takeOne({});
  });

  it("rejects empty arrays where one element is required", () => {
    takeNonEmpty(["a"]);
    // @ts-expect-error - empty array has no element to match
    takeNonEmpty([]);
  });

  it("pins event maps and array helpers", () => {
    expectTypeOf<EventMap<AppEvents>>().toMatchTypeOf<AppEvents>();
    expectTypeOf<MutableArray<readonly string[]>>().toEqualTypeOf<string[]>();
    expectTypeOf<ArrayElement<readonly [number, string]>>().toEqualTypeOf<number | string>();
  });
});
