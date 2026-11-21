import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import MangaSources from "@/routes/components/manga/sources.manga";

const { getSources, setSource } = vi.hoisted(() => ({
  getSources: vi.fn(),
  setSource: vi.fn(),
}));
vi.mock("@/api/manga.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/manga.api")>()),
  getMangaSources: getSources,
  setMangaSource: setSource,
}));

afterEach(cleanup);

it("keeps the checkbox focused and saves rapid changes in order", async () => {
  const save = Promise.withResolvers<undefined>();
  getSources.mockResolvedValue([
    { id: "mangalib", enabled: true },
    { id: "mangadex", enabled: true },
  ]);
  const saveAgain = Promise.withResolvers<undefined>();
  setSource
    .mockImplementationOnce(async () => {
      await save.promise;
      getSources.mockResolvedValue([
        { id: "mangalib", enabled: false },
        { id: "mangadex", enabled: true },
      ]);
    })
    .mockImplementationOnce(async () => {
      await saveAgain.promise;
      getSources.mockResolvedValue([
        { id: "mangalib", enabled: true },
        { id: "mangadex", enabled: true },
      ]);
    });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MangaSources />
    </QueryClientProvider>
  );

  const mangaLib = await screen.findByRole("checkbox", { name: "MangaLib" });
  const mangaDex = screen.getByRole("checkbox", { name: "MangaDex" });
  mangaLib.focus();
  fireEvent.click(mangaLib);
  await waitFor(() => expect(setSource).toHaveBeenCalledWith("mangalib", false));
  expect(mangaLib.getAttribute("aria-checked")).toBe("false");
  expect(Object.hasOwn(mangaLib.dataset, "disabled")).toBe(false);
  expect(document.activeElement).toBe(mangaLib);
  expect(Object.hasOwn(mangaDex.dataset, "disabled")).toBe(false);

  fireEvent.click(mangaLib);
  await waitFor(() => expect(mangaLib.getAttribute("aria-checked")).toBe("true"));
  expect(setSource).toHaveBeenCalledTimes(1);

  save.resolve(undefined);
  await waitFor(() => expect(setSource).toHaveBeenNthCalledWith(2, "mangalib", true));
  expect(mangaLib.getAttribute("aria-checked")).toBe("true");
  expect(document.activeElement).toBe(mangaLib);

  saveAgain.resolve(undefined);
  await waitFor(() => expect(getSources).toHaveBeenCalledTimes(3));
  expect(mangaLib.getAttribute("aria-checked")).toBe("true");
  expect(mangaDex.getAttribute("aria-checked")).toBe("true");
});
