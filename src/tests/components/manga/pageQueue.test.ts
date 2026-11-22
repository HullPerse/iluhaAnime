import { expect, it } from "vitest";

import { enqueueMangaPage } from "@/lib/manga/pageQueue.utils";

it("orders queued pages per manifest and continues after a page fails", async () => {
  const started: string[] = [];
  const first = Promise.withResolvers<number>();
  const second = enqueueMangaPage("chapter", 2, async () => {
    started.push("chapter:2");

    return 2;
  });
  const failure = enqueueMangaPage("chapter", 1, () => {
    started.push("chapter:1");

    return first.promise;
  });
  const rejected = expect(failure).rejects.toThrow("page failed");
  const other = enqueueMangaPage("other", 1, async () => {
    started.push("other:1");

    return 1;
  });

  await expect(other).resolves.toBe(1);
  expect(started).toEqual(["chapter:1", "other:1"]);
  first.reject(new Error("page failed"));
  await rejected;
  await expect(second).resolves.toBe(2);
  expect(started).toEqual(["chapter:1", "other:1", "chapter:2"]);
});
