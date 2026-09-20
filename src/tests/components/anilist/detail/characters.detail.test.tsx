import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CHAR_PAGE_SIZE } from "@/config/anilist/pagination.config";
import AniListCharactersPanel from "@/routes/components/anilist/detail/characters.detail";
import { useSettingsStore } from "@/store/settings.store";
import type { AniCharacterEdge, AniVoiceActor, AnilistRouteData } from "@/types/anilist";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

beforeEach(() => {
  invokeMock.mockReset();
  useSettingsStore.setState({ language: "en" });
});

afterEach(() => {
  cleanup();
});

function edge(
  id: number,
  name: string,
  role: string,
  voiceActors: AniVoiceActor[] = []
): AniCharacterEdge {
  return {
    role,
    character: { id, name, image: null } as AniCharacterEdge["character"],
    voice_actors: voiceActors,
  };
}

function renderPanel(
  favouriteIds: number[] = [],
  onVoiceActorClick?: (
    character: { id: number; name: string; voiceActors: AniVoiceActor[] },
    voiceActor: AniVoiceActor
  ) => void
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (favouriteIds.length > 0) {
    queryClient.setQueryData(["anilist_data"], {
      people: { characters: favouriteIds.map((id) => ({ id })) },
    } as unknown as AnilistRouteData);
  }
  return render(
    <QueryClientProvider client={queryClient}>
      <AniListCharactersPanel animeId={21} onVoiceActorClick={onVoiceActorClick} />
    </QueryClientProvider>
  );
}

/** The panel starts collapsed, so the tiles are only reachable once it is opened. */
async function expand() {
  await userEvent.setup().click(await screen.findByRole("button", { name: "Expand section" }));
}

describe("AniListCharactersPanel", () => {
  it("stays out of the way when the title has no characters", async () => {
    invokeMock.mockResolvedValue([]);
    const { container } = renderPanel();

    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    await waitFor(() => expect(container.innerHTML).toBe(""));
  });

  it("marks the favourites", async () => {
    invokeMock.mockResolvedValue([edge(1, "Eren", "MAIN"), edge(2, "Mikasa", "SUPPORTING")]);
    renderPanel([2]);
    await expand();

    expect(screen.getByRole("button", { name: "Eren" })).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Mikasa" }).querySelector(".lucide-heart")
    ).not.toBeNull();
    expect(screen.getByRole("button", { name: "Eren" }).querySelector(".lucide-heart")).toBeNull();
  });

  it("offers the role filter only when both roles are present, and applies it", async () => {
    invokeMock.mockResolvedValue([edge(1, "Eren", "MAIN"), edge(2, "Mikasa", "SUPPORTING")]);
    const user = userEvent.setup();
    renderPanel();
    await expand();

    await user.click(screen.getByRole("button", { name: "Supporting" }));

    expect(screen.getByRole("button", { name: "Mikasa" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Eren" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getByRole("button", { name: "Eren" })).toBeDefined();
  });

  it("shows who voices a character on hover", async () => {
    const voiceActor: AniVoiceActor = {
      id: 7,
      name: "Yuki Kaji",
      native_name: "梶裕貴",
      image: "kaji.jpg",
      language: "Japanese",
    };
    invokeMock.mockResolvedValue([edge(1, "Eren", "MAIN", [voiceActor]), edge(2, "Armin", "MAIN")]);
    const user = userEvent.setup();
    renderPanel();
    await expand();

    expect(screen.queryByText("Yuki Kaji")).toBeNull();
    await user.hover(screen.getByRole("button", { name: "Eren" }));
    expect(await screen.findByText("Yuki Kaji", {}, { timeout: 3000 })).toBeDefined();
    expect(screen.getByText("梶裕貴")).toBeDefined();
    // Without a navigation handler the row is informational: nothing to click through to.
    expect(screen.queryByRole("button", { name: "Yuki Kaji" })).toBeNull();

    // A character the endpoint returned without voice actors has nothing to preview.
    await user.unhover(screen.getByRole("button", { name: "Eren" }));
    await waitFor(() => expect(screen.queryByText("Yuki Kaji")).toBeNull());
    await user.hover(screen.getByRole("button", { name: "Armin" }));
    expect(screen.queryByText("Yuki Kaji")).toBeNull();
  });

  it("opens a voice actor from the card and takes the card down with it", async () => {
    const voiceActor: AniVoiceActor = {
      id: 7,
      name: "Yuki Kaji",
      native_name: "梶裕貴",
      image: null,
      language: "Japanese",
    };
    invokeMock.mockResolvedValue([edge(1, "Eren", "MAIN", [voiceActor])]);
    const onVoiceActorClick = vi.fn();
    const user = userEvent.setup();
    renderPanel([], onVoiceActorClick);
    await expand();

    await user.hover(screen.getByRole("button", { name: "Eren" }));
    await user.click(await screen.findByRole("button", { name: "Yuki Kaji" }, { timeout: 3000 }));

    expect(onVoiceActorClick).toHaveBeenCalledWith(
      { id: 1, name: "Eren", voiceActors: [voiceActor] },
      voiceActor
    );
    await waitFor(() => expect(screen.queryByText("Yuki Kaji")).toBeNull());
  });

  it("hides the role filter when every character has the same role", async () => {
    invokeMock.mockResolvedValue([edge(1, "Eren", "MAIN"), edge(2, "Armin", "MAIN")]);
    renderPanel();
    await expand();

    expect(screen.getByRole("button", { name: "Eren" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "All" })).toBeNull();
  });

  it("appends the next page of characters", async () => {
    const fullPage = Array.from({ length: CHAR_PAGE_SIZE }, (_, index) =>
      edge(100 + index, `Filler ${index}`, "MAIN")
    );
    let call = 0;
    invokeMock.mockImplementation(() => {
      call += 1;
      return Promise.resolve(call === 1 ? fullPage : [edge(900, "Last one", "MAIN")]);
    });
    const user = userEvent.setup();
    renderPanel();
    await expand();

    await user.click(screen.getByRole("button", { name: "Show more" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Last one" })).toBeDefined();
    });
    expect(screen.getByRole("button", { name: "Filler 0" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });
});
