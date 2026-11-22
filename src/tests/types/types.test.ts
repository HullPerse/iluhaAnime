import { describe, expect, expectTypeOf, it } from "vitest";

import { assertNever } from "@hullperse/hp_utils/type";
import type {
  AniListId,
  ArrayElement,
  Brand,
  DeepPartial,
  DeepReadonly,
  EventMap,
  FilePath,
  MagnetLink,
  MutableArray,
  TorrentHash,
} from "@/types/core/types";

interface NestedShape {
  a: { b: string };
  list: number[];
}

interface AppEvents {
  open: [id: number];
  close: [];
}

describe("types/utils", () => {
  it("throws on unreachable values", () => {
    expect(() => assertNever("oops" as never)).toThrow("Unexpected value: oops");
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
  });

  it("keeps deep and event helpers composable", () => {
    const partial: DeepPartial<NestedShape> = { a: {} };
    expectTypeOf(partial.a).toEqualTypeOf<{ b?: string } | undefined>();
    expectTypeOf<DeepPartial<() => void>>().toEqualTypeOf<() => void>();
    expectTypeOf<DeepReadonly<NestedShape>>().toMatchTypeOf<{
      readonly a: { readonly b: string };
      readonly list: readonly number[];
    }>();
    expectTypeOf<EventMap<AppEvents>>().toMatchTypeOf<AppEvents>();
    expectTypeOf<MutableArray<readonly string[]>>().toEqualTypeOf<string[]>();
    expectTypeOf<ArrayElement<readonly [number, string]>>().toEqualTypeOf<number | string>();
  });
});
