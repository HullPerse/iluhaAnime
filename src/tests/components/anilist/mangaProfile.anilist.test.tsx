import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import AniListMangaProfile from "@/routes/components/anilist/mangaProfile.anilist";
import { filterOpen } from "@/store/anilistMangaProfile.store";

afterEach(() => {
  cleanup();
  filterOpen.set(false);
});

it("keeps the search field mounted when opening manga filters", () => {
  const client = new QueryClient();
  const { container } = render(
    <QueryClientProvider client={client}>
      <AniListMangaProfile friends={[]} />
    </QueryClientProvider>
  );

  const input = container.querySelector<HTMLInputElement>("[name=query]");
  const filterButton = screen.getByRole("button", { name: "Фильтры" });

  if (!input || !filterButton) throw new Error("Missing profile search controls");
  fireEvent.change(input, { target: { value: "Frieren" } });
  fireEvent.click(filterButton);

  expect(filterOpen.get()).toBe(true);
  expect(container.querySelector("[name=query]")).toBe(input);
  expect(input.value).toBe("Frieren");
  client.clear();
});
