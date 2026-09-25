import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AniListFriendsModal from "@/routes/components/anilist/friends.anilist";
import { useSettingsStore } from "@/store/settings.store";
import type { AniFriend, AniUser } from "@/types/anilist";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

const SELF: AniUser = {
  id: 1,
  name: "Me",
  avatar: null,
  anime_count: 0,
  episodes_watched: 0,
  mean_score: null,
  score_format: null,
};

const ADDED: AniFriend = { id: 7, name: "A", avatar: null, added_at: 1 };

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
}

function renderModal(friends: AniFriend[], onAddMany: (friends: unknown[]) => void) {
  return render(
    <AniListFriendsModal
      friends={friends}
      selfUser={SELF}
      selfLists={[]}
      selfFavourites={[]}
      onAdd={vi.fn()}
      onAddMany={onAddMany}
      onRemove={vi.fn()}
      onViewLists={vi.fn()}
      onClose={vi.fn()}
    />,
    { wrapper }
  );
}

async function openImport() {
  await userEvent.click(screen.getByRole("button", { name: "From AniList" }));
  await waitFor(() => {
    expect(screen.getByText("B")).toBeDefined();
  });
}

afterEach(() => cleanup());

beforeEach(() => {
  invokeMock.mockReset();
  useSettingsStore.setState({ language: "en", anilistProxyUrl: null });
  invokeMock.mockImplementation((command: string) => {
    if (command === "get_anilist_following") {
      return Promise.resolve({
        users: [
          { id: 7, name: "A", avatar: null },
          { id: 9, name: "B", avatar: null },
        ],
        has_next_page: false,
        total: 2,
      });
    }
    return Promise.reject(new Error(`unexpected command ${command}`));
  });
});

describe("AniListFriendsModal following import", () => {
  it("disables the already added friend on repeat open", async () => {
    renderModal([ADDED], vi.fn());
    await openImport();

    const addedBox = screen.getByRole("checkbox", { name: "A" });
    const newBox = screen.getByRole("checkbox", { name: "B" });
    expect(addedBox.getAttribute("aria-disabled")).toBe("true");
    expect(addedBox.getAttribute("aria-checked")).toBe("true");
    expect(newBox.getAttribute("aria-disabled")).not.toBe("true");
    expect(newBox.getAttribute("aria-checked")).toBe("false");
  });

  it("adds only the checked new friends", async () => {
    const onAddMany = vi.fn();
    renderModal([ADDED], onAddMany);
    await openImport();

    await userEvent.click(screen.getByRole("checkbox", { name: "B" }));
    await userEvent.click(screen.getByRole("button", { name: "Add selected" }));

    expect(onAddMany).toHaveBeenCalledTimes(1);
    expect(onAddMany).toHaveBeenCalledWith([{ id: 9, name: "B", avatar: null }]);
  });

  it("selects all only among friends that are not added yet", async () => {
    const onAddMany = vi.fn();
    renderModal([ADDED], onAddMany);
    await openImport();

    await userEvent.click(screen.getByRole("checkbox", { name: "Select all" }));
    expect(screen.getByText("Selected: 1")).toBeDefined();
    await userEvent.click(screen.getByRole("button", { name: "Add selected" }));

    expect(onAddMany).toHaveBeenCalledWith([{ id: 9, name: "B", avatar: null }]);
  });
});
