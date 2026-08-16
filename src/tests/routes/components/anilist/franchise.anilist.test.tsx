import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FranchiseGraph } from "@/types/anilist";

const franchiseGraph: FranchiseGraph = {
  root_id: 1,
  nodes: [
    {
      cover_url: null,
      episodes: 24,
      format: "TV",
      id: 1,
      media_type: "ANIME",
      score: 8,
      title: "Franchise root",
      year: 2010,
    },
    {
      cover_url: null,
      episodes: 24,
      format: "TV",
      id: 2,
      media_type: "ANIME",
      score: 8,
      title: "Second season",
      year: 2012,
    },
    {
      cover_url: null,
      episodes: 12,
      format: "TV",
      id: 3,
      media_type: "ANIME",
      score: 7,
      title: "Side story",
      year: 2013,
    },
    {
      cover_url: null,
      episodes: 12,
      format: "OVA",
      id: 4,
      media_type: "ANIME",
      score: 7,
      title: "Spin-off",
      year: 2014,
    },
  ],
  edges: [
    { relation_type: "SEQUEL", source: 1, target: 2 },
    { relation_type: "SIDE_STORY", source: 1, target: 3 },
    { relation_type: "SPIN_OFF", source: 1, target: 4 },
  ],
};

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("react-zoom-pan-pinch", () => ({
  TransformComponent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  TransformWrapper: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

import FranchiseGraphSection from "@/routes/components/anilist/details.franchise";
import { useSettingsStore } from "@/store/settings.store";

function renderFranchise() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <FranchiseGraphSection animeId={1} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation((command: string) => {
    if (command === "get_anime_franchise")
      return Promise.resolve(franchiseGraph);
    return Promise.resolve(undefined);
  });
  useSettingsStore.setState({ language: "en" });
  Object.defineProperty(window, "ResizeObserver", {
    configurable: true,
    writable: true,
    value: class {
      observe() {}
      disconnect() {}
    },
  });
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("FranchiseGraphSection", () => {
  it("shows the grouped list by default with every related anime", async () => {
    const user = userEvent.setup();
    renderFranchise();

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_anime_franchise", {
        id: 1,
        scope: "all",
      });
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Franchise root" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Second season" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Side story" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Spin-off" })).toBeTruthy();
    });
    expect(
      screen
        .getAllByRole("button")
        .filter((button) =>
          [
            "Franchise root",
            "Second season",
            "Side story",
            "Spin-off",
          ].includes(button.getAttribute("aria-label") ?? "")
        )
    ).toHaveLength(4);

    await user.click(screen.getByRole("button", { name: "Graph" }));

    await waitFor(() => {
      expect(document.querySelector("#franchise-node-1")).not.toBeNull();
      expect(document.querySelector("#franchise-node-2")).not.toBeNull();
      expect(document.querySelector("#franchise-node-3")).not.toBeNull();
      expect(document.querySelector("#franchise-node-4")).not.toBeNull();
    });
  });
});
