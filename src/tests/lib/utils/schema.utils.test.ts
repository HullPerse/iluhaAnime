import { describe, expect, it } from "vitest";
import * as z from "zod/mini";

import { err, ok } from "@/lib/utils/result.utils";
import { parseJson, parseValue, toValidator } from "@/lib/utils/schema.utils";

const ItemSchema = z.object({
  id: z.number().check(z.gt(0)),
  title: z.string().check(z.trim(), z.minLength(1)),
  tags: z.optional(z.array(z.string())),
});

describe("parseValue contract", () => {
  it("returns the parsed value and strips unknown keys", () => {
    const parsed = parseValue({ id: 3, title: " Souou ", notes: "leak" }, ItemSchema);
    expect(parsed).toEqual(ok({ id: 3, title: "Souou" }));
  });

  it("names the failing path in the error", () => {
    const parsed = parseValue({ id: -1, title: "x" }, ItemSchema);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error.message).toContain("id");
  });

  it("reports a missing required field", () => {
    const parsed = parseValue({ title: "x" }, ItemSchema);
    expect(parsed.ok).toBe(false);
  });

  it("rejects a non-object payload", () => {
    expect(parseValue([1, 2, 3], ItemSchema)).toEqual(err(new Error("Invalid input")));
  });
});

describe("parseJson contract", () => {
  it("parses valid text", () => {
    expect(parseJson('{"id":1,"title":"Souou"}', ItemSchema)).toEqual(
      ok({ id: 1, title: "Souou" })
    );
  });

  it("keeps a malformed json failure distinct from a schema failure", () => {
    const malformed = parseJson("{not json", ItemSchema);
    expect(malformed.ok).toBe(false);
    if (!malformed.ok) expect(malformed.error.message).not.toContain("id");

    const wrongShape = parseJson('{"id":"one"}', ItemSchema);
    expect(wrongShape.ok).toBe(false);
    if (!wrongShape.ok) expect(wrongShape.error.message).toContain("id");
  });

  it("rejects an array payload", () => {
    expect(parseJson("[1,2,3]", ItemSchema)).toEqual(err(new Error("Invalid input")));
  });
});

describe("toValidator contract", () => {
  const isItem = toValidator(ItemSchema);

  it("accepts a valid value and rejects an invalid one", () => {
    expect(isItem({ id: 1, title: "Souou" })).toBe(true);
    expect(isItem({ id: 0, title: "" })).toBe(false);
    expect(isItem("nope")).toBe(false);
  });
});

describe("compile contract", () => {
  const Compiled = z.compile(ItemSchema);

  it("keeps the parsing result of the plain schema", () => {
    expect(Compiled.safeParse({ id: 2, title: "Souou" })).toEqual(
      ItemSchema.safeParse({ id: 2, title: "Souou" })
    );
    expect(Compiled.safeParse({ id: 0, title: "" }).success).toBe(false);
  });

  it("still trims and strips through parseValue", () => {
    expect(parseValue({ id: 2, title: " Box ", junk: 1 }, Compiled)).toEqual(
      ok({ id: 2, title: "Box" })
    );
  });
});
