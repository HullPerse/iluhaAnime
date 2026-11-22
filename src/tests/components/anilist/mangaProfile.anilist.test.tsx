import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { Profiler } from "react";
import { afterEach, expect, it } from "vitest";

import AniListMangaProfile from "@/routes/components/anilist/mangaProfile.anilist";
import { filterOpen } from "@/store/anilistMangaProfile.store";

afterEach(() => {
  cleanup();
  filterOpen.set(false);
});

it("keeps the search field mounted when opening manga filters", () => {
  const commits: string[] = [];
  const client = new QueryClient();
  const { container } = render(
    <QueryClientProvider client={client}>
      <Profiler id="manga-profile" onRender={(_, phase) => commits.push(phase)}>
        <AniListMangaProfile friends={[]} />
      </Profiler>
    </QueryClientProvider>
  );

  const input = container.querySelector<HTMLInputElement>("[name=query]");
  const filterButton = container.querySelector("form > button");

  if (!input || !filterButton) throw new Error("Missing profile search controls");
  fireEvent.change(input, { target: { value: "Frieren" } });
  fireEvent.click(filterButton);

  expect(filterOpen.get()).toBe(true);
  expect(container.querySelector("[name=query]")).toBe(input);
  expect(input.value).toBe("Frieren");
  expect(commits).toEqual([
    "mount",
    "update",
    "nested-update",
    "nested-update",
    "nested-update",
    "nested-update",
  ]);
});
