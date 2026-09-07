import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import InputSearch from "@/routes/components/search/modern/input.search";
import { useSearchStore } from "@/store/search.store";
import { useSettingsStore } from "@/store/settings.store";
import type { Anime } from "@/types";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

let resolveSearch: (items: Anime[]) => void = () => {};

const ITEM: Anime = {
  title: "Mock Frieren 1080p",
  magnet: "",
  torrent: "",
  size: "1 GiB",
  seeders: 10,
  leechers: 1,
  category: "Anime",
  link: "https://example.com/mock",
};

function renderInput() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <InputSearch />
    </QueryClientProvider>
  );
}

function windowSection(): HTMLElement | null {
  return document.querySelector("section.absolute");
}

afterEach(() => cleanup());

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
  useSearchStore.setState({ history: [] });
  mockInvoke.mockImplementation((command: string) => {
    if (command === "search_erairaws")
      return new Promise<Anime[]>((resolve) => {
        resolveSearch = resolve;
      });
    if (command.startsWith("check_")) return Promise.resolve(false);
    return Promise.resolve([]);
  });
});

describe("InputSearch modern row", () => {
  it("submits the typed query to the visible source", async () => {
    const user = userEvent.setup();
    renderInput();
    await user.type(screen.getByPlaceholderText("Search anime..."), "frieren");
    const bar = screen.getByPlaceholderText("Search anime...").closest("section");
    if (!bar?.parentElement) throw new Error("Input row not found");
    const buttons = within(bar.parentElement).getAllByRole("button");
    await user.click(buttons.at(-1)!);
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith(
        "search_erairaws",
        expect.objectContaining({ query: "frieren" })
      )
    );
  });

  it("docks to the top and shows results after submit", async () => {
    const user = userEvent.setup();
    renderInput();
    await user.type(screen.getByPlaceholderText("Search anime..."), "frieren");
    const bar = screen.getByPlaceholderText("Search anime...").closest("section");
    if (!bar?.parentElement) throw new Error("Input row not found");
    await user.click(within(bar.parentElement).getAllByRole("button").at(-1)!);
    expect(windowSection()?.classList.contains("top-1/2")).toBe(true);
    resolveSearch([ITEM]);
    await waitFor(() => expect(windowSection()?.classList.contains("top-2")).toBe(true));
    expect(windowSection()?.classList.contains("bottom-2")).toBe(true);
    expect(windowSection()?.classList.contains("search-dock-motion")).toBe(true);
    expect(await screen.findByText("Mock Frieren 1080p")).not.toBeNull();
  });

  it("opens the suggestion menu above while idle", async () => {
    const user = userEvent.setup();
    useSearchStore.setState({ history: ["frieren 1080p"] });
    renderInput();
    await user.click(screen.getByPlaceholderText("Search anime..."));
    const menu = await screen.findByRole("listbox");
    expect(menu.classList.contains("bottom-full")).toBe(true);
  });

  it("opens the suggestion menu below once docked", async () => {
    const user = userEvent.setup();
    useSearchStore.setState({ history: ["frieren 1080p"] });
    renderInput();
    await user.type(screen.getByPlaceholderText("Search anime..."), "frieren");
    const bar = screen.getByPlaceholderText("Search anime...").closest("section");
    if (!bar?.parentElement) throw new Error("Input row not found");
    await user.click(within(bar.parentElement).getAllByRole("button").at(-1)!);
    resolveSearch([ITEM]);
    await waitFor(() => expect(windowSection()?.classList.contains("top-2")).toBe(true));
    await user.click(screen.getByPlaceholderText("Search anime..."));
    const menu = await screen.findByRole("listbox");
    expect(menu.classList.contains("top-full")).toBe(true);
  });

  it("disables reset while idle", async () => {
    renderInput();
    expect((screen.getByTitle("Hide results") as HTMLButtonElement).disabled).toBe(true);
  });

  it("resets results back to the idle window", async () => {
    const user = userEvent.setup();
    renderInput();
    await user.type(screen.getByPlaceholderText("Search anime..."), "frieren");
    const bar = screen.getByPlaceholderText("Search anime...").closest("section");
    if (!bar?.parentElement) throw new Error("Input row not found");
    await user.click(within(bar.parentElement).getAllByRole("button").at(-1)!);
    resolveSearch([ITEM]);
    await waitFor(() => expect(windowSection()?.classList.contains("top-2")).toBe(true));
    expect((screen.getByTitle("Hide results") as HTMLButtonElement).disabled).toBe(false);
    await user.click(screen.getByTitle("Hide results"));
    await waitFor(() => expect(windowSection()?.classList.contains("top-1/2")).toBe(true));
    expect((screen.getByPlaceholderText("Search anime...") as HTMLInputElement).value).toBe("");
    expect(screen.queryByText("Mock Frieren 1080p")).toBeNull();
  });

  it("opens the filters modal with the sort section", async () => {
    const user = userEvent.setup();
    renderInput();
    await user.click(screen.getByTitle("Search filters"));
    expect(await screen.findByText("Sort:")).not.toBeNull();
  });
});
