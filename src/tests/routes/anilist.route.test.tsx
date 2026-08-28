import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AnilistRoute from "@/routes/anilist.route";
import { useSettingsStore } from "@/store/settings.store";

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

const user = {
  id: 1,
  name: "TestUser",
  avatar: null,
  anime_count: 0,
  episodes_watched: 0,
  mean_score: null,
};

const ACTIVITY_TITLE = "Activity and history";
const ACTIVITY_BUTTON = "Activity history";

function renderRoute() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AnilistRoute />
    </QueryClientProvider>
  );
}

function emptyListInvoke(cmd: string): Promise<unknown> {
  switch (cmd) {
    case "check_anilist_auth": {
      return Promise.resolve(user);
    }
    case "get_anilist_lists": {
      return Promise.resolve([]);
    }
    case "get_favourites": {
      return Promise.resolve([]);
    }
    case "sync_franchise_to_index": {
      return Promise.resolve(null);
    }
    case "get_anilist_activity": {
      return Promise.resolve([]);
    }
    default: {
      return Promise.resolve(null);
    }
  }
}

function listInvoke(cmd: string): Promise<unknown> {
  switch (cmd) {
    case "check_anilist_auth": {
      return Promise.resolve(user);
    }
    case "get_anilist_lists": {
      return Promise.resolve([
        { name: "Watching", isCustomList: false, entries: [] },
      ]);
    }
    case "get_favourites": {
      return Promise.resolve([]);
    }
    case "sync_franchise_to_index": {
      return Promise.resolve(null);
    }
    case "get_anilist_activity": {
      return Promise.resolve([]);
    }
    default: {
      return Promise.resolve(null);
    }
  }
}

afterEach(() => cleanup());

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
  mockInvoke.mockReset();
  mockInvoke.mockImplementation(emptyListInvoke);
});

describe("AnilistRoute activity modal", () => {
  it("does not auto-open the activity modal when the tab loads", async () => {
    renderRoute();
    await screen.findByText("TESTUSER");
    expect(screen.queryByText(ACTIVITY_TITLE)).toBeNull();
  });

  it("opens the activity modal only after clicking the activity button", async () => {
    mockInvoke.mockImplementation(listInvoke);
    const userEventInstance = userEvent.setup();
    renderRoute();
    await screen.findByText("TESTUSER");
    expect(screen.queryByText(ACTIVITY_TITLE)).toBeNull();

    const buttons = screen.getAllByRole("button", {
      name: ACTIVITY_BUTTON,
    });
    await userEventInstance.click(buttons[0]!);
    expect(await screen.findByText(ACTIVITY_TITLE)).toBeTruthy();
  });
});
