import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WizardModal } from "@/routes/components/collection/wizard/modal.wizard";
import { useSettingsStore } from "@/store/settings.store";
import type { CollectionItem, CollectionStatusDef } from "@/types/collection";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

const mockOpenDialog = vi.fn();
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => mockOpenDialog(...args),
}));

vi.mock("@/lib/collection/placeholder.utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/collection/placeholder.utils")>();
  return {
    ...actual,
    generatePlaceholder: () => "data:image/png;base64,PLACEHOLDER",
  };
});

const STATUSES: CollectionStatusDef[] = [
  { id: "planned", label: "Planned", color: "#9ca3af", order: 0, isCore: true },
  { id: "watching", label: "Watching", color: "#3b82f6", order: 1, isCore: true },
];

function renderWizard(props: Partial<React.ComponentProps<typeof WizardModal>> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <WizardModal
        open
        onClose={vi.fn()}
        onSave={vi.fn()}
        statuses={STATUSES}
        customFieldDefs={[]}
        {...props}
      />
    </QueryClientProvider>
  );
}

afterEach(() => cleanup());

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
  mockInvoke.mockReset();
  mockOpenDialog.mockReset();
});

describe("WizardModal add mode", () => {
  it("opens on the source tab with a disabled save button", () => {
    renderWizard();
    expect(screen.getByRole("tab", { name: "Source" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Custom" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "AniList" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "TMDB" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText("Cover is required to save.")).toHaveLength(1);
  });

  it("shows the cover required hint twice once the cover tab opens", async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole("tab", { name: "Cover" }));
    expect(screen.getAllByText("Cover is required to save.")).toHaveLength(2);
  });

  it("saves a placeholder cover without downloading", async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation(async () => null);
    const onSave = vi.fn();
    renderWizard({ onSave });
    await user.click(screen.getByRole("tab", { name: "Details" }));
    await user.type(screen.getByLabelText("Title"), "Frieren");
    await user.click(screen.getByRole("tab", { name: "Cover" }));
    await user.click(screen.getByRole("button", { name: "Placeholder with text" }));
    const save = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    await user.click(save);
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = onSave.mock.calls[0][0] as { title: string; coverBlobId: null };
    expect(saved.title).toBe("Frieren");
    expect(saved.coverBlobId).toBeNull();
    expect(mockInvoke).not.toHaveBeenCalledWith("download_remote_image", expect.anything());
  });

  it("uploads a local cover and saves it with the blob id", async () => {
    const user = userEvent.setup();
    mockOpenDialog.mockResolvedValue("C:\\fake\\cover.png");
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "import_user_image") {
        return {
          id: "blob_1",
          name: "cover.png",
          mimeType: "image/png",
          path: "C:/images/blob_1.png",
          originalPath: null,
          createdAt: 0,
        };
      }
      return null;
    });
    const onSave = vi.fn();
    renderWizard({ onSave });
    await user.click(screen.getByRole("tab", { name: "Details" }));
    await user.type(screen.getByLabelText("Title"), "Frieren");
    await user.click(screen.getByRole("tab", { name: "Cover" }));
    await user.click(screen.getByRole("button", { name: "Upload image" }));
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("import_user_image", {
        path: "C:\\fake\\cover.png",
      })
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = onSave.mock.calls[0][0] as { coverBlobId: string };
    expect(saved.coverBlobId).toBe("blob_1");
    expect(mockInvoke).not.toHaveBeenCalledWith("download_remote_image", expect.anything());
  });
});

describe("WizardModal edit mode", () => {
  it("opens on details without the source tab and offers delete", () => {
    const initial: CollectionItem = {
      id: "item_1",
      title: "Naruto",
      altTitles: [],
      type: "anime",
      status: "watching",
      progressValue: 12,
      progressTotal: 220,
      progressUnit: "episodes",
      durationMinutes: 23,
      rating: 8,
      priority: "normal",
      isFavorite: false,
      year: 2002,
      genres: ["Action"],
      studio: "Pierrot",
      description: null,
      notes: null,
      coverUrl: "data:image/png;base64,AAAA",
      coverBlobId: "blob_9",
      thumbBlobId: null,
      externalIds: {},
      customFields: {},
      localPath: null,
      localKind: null,
      startedAt: null,
      finishedAt: null,
      lastWatchedAt: null,
      rewatchCount: 0,
      addedAt: 0,
      updatedAt: 0,
      sitesToView: [],
      tvCurrentSeason: null,
      tvCurrentEpisode: null,
      detailsJson: null,
    };
    const onDelete = vi.fn();
    renderWizard({ initial, onDelete });
    expect(screen.queryByRole("tab", { name: "Source" })).toBeNull();
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Naruto");
    expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy();
  });
});

describe("WizardModal TMDB metadata", () => {
  it("backfills genres and description when picking a TMDB result", async () => {
    useSettingsStore.setState({ tmdbApiKey: "test-key" });
    mockInvoke.mockImplementation((cmd: unknown) => {
      if (cmd === "search_tmdb")
        return Promise.resolve([
          {
            id: 1,
            title: "Dune",
            cover_url: null,
            year: 2021,
            mediaType: "movie",
            altTitles: [],
          },
        ]);
      if (cmd === "get_tmdb_details")
        return Promise.resolve({
          title: "Dune",
          overview: "Desert epic",
          year: 2021,
          runtimeMinutes: 155,
          genres: ["Action", "Drama"],
          posters: [],
        });
      return Promise.resolve([]);
    });
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole("button", { name: "TMDB" }));
    await user.type(screen.getByRole("textbox"), "dune");
    await waitFor(() => expect(screen.getByRole("button", { name: /Dune/ })).toBeTruthy());
    await user.click(screen.getByRole("button", { name: /Dune/ }));
    await user.click(screen.getByRole("tab", { name: "Details" }));
    const more = screen.getByRole("button", { name: "More options" });
    await user.click(more);
    await waitFor(() => expect(screen.getByDisplayValue("Action, Drama")).toBeTruthy());
    expect(screen.getByDisplayValue("Desert epic")).toBeTruthy();
    expect(mockInvoke).toHaveBeenCalledWith("get_tmdb_details", expect.anything());
  });

  it("stores stills and trailer in detailsJson on save", async () => {
    useSettingsStore.setState({ tmdbApiKey: "test-key" });
    mockInvoke.mockImplementation((cmd: unknown) => {
      if (cmd === "search_tmdb")
        return Promise.resolve([
          {
            id: 2,
            title: "Frieren",
            cover_url: "https://img/cover.jpg",
            year: 2023,
            mediaType: "tv",
            altTitles: [],
          },
        ]);
      if (cmd === "get_tmdb_details")
        return Promise.resolve({
          title: "Frieren",
          overview: null,
          year: 2023,
          runtimeMinutes: null,
          genres: [],
          posters: [],
        });
      if (cmd === "get_tmdb_media")
        return Promise.resolve({
          backdrops: [{ url: "https://img/s1.jpg" }],
          trailerYoutubeId: "t1",
        });
      return Promise.resolve([]);
    });
    const onSave = vi.fn();
    const user = userEvent.setup();
    renderWizard({ onSave });
    await user.click(screen.getByRole("button", { name: "TMDB" }));
    await user.type(screen.getByRole("textbox"), "frieren");
    await waitFor(() => expect(screen.getByRole("button", { name: /Frieren/ })).toBeTruthy());
    await user.click(screen.getByRole("button", { name: /Frieren/ }));
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("get_tmdb_media", expect.anything())
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const saved = onSave.mock.calls[0][0] as { detailsJson: unknown };
    expect(saved.detailsJson).toEqual({
      stills: ["https://img/s1.jpg"],
      trailerYoutubeId: "t1",
    });
  });
});

describe("WizardModal AniList tags", () => {
  it("merges anilist tags into genres when picking a result", async () => {
    mockInvoke.mockImplementation((cmd: unknown) => {
      if (cmd === "search_anilist")
        return Promise.resolve([
          {
            id: 7,
            title: "Frieren",
            titles: ["Frieren"],
            cover_url: null,
            season_year: 2023,
            duration: 24,
            episodes: 28,
            genres: ["Adventure"],
            tags: ["Male Protagonist", "adventure"],
            studios: [{ id: 1, name: "Madhouse" }],
          },
        ]);
      return Promise.resolve([]);
    });
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole("button", { name: "AniList" }));
    await user.type(screen.getByRole("textbox"), "frieren");
    await waitFor(() => expect(screen.getByRole("button", { name: /Frieren/ })).toBeTruthy());
    await user.click(screen.getByRole("button", { name: /Frieren/ }));
    await user.click(screen.getByRole("tab", { name: "Details" }));
    await user.click(screen.getByRole("button", { name: "More options" }));
    await waitFor(() =>
      expect(screen.getByDisplayValue("Adventure, Male Protagonist")).toBeTruthy()
    );
  });
});
