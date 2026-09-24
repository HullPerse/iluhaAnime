import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetRemoteImageCache } from "@/hooks/remoteImage.hook";
import { WizardModal } from "@/routes/components/collection/wizard/modal.wizard";
import { useSettingsStore } from "@/store/settings.store";
import type { CollectionStatusDef } from "@/types/collection";

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
  { id: "planned", label: "Planned", color: "#9ca3af", order: 0, isCore: true, kind: "private" },
  { id: "watching", label: "Watching", color: "#3b82f6", order: 1, isCore: true, kind: "private" },
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
  resetRemoteImageCache();
});

describe("WizardModal add mode", () => {
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

describe("WizardModal TMDB metadata", () => {
  it("backfills genres and description when picking a TMDB result", async () => {
    useSettingsStore.setState({ tmdbKeySet: true });
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
    await user.type(screen.getByRole("combobox"), "dune");
    await waitFor(() => expect(screen.getByRole("option", { name: /Dune/ })).toBeTruthy());
    await user.click(screen.getByRole("option", { name: /Dune/ }));
    await user.click(screen.getByRole("tab", { name: "Details" }));
    const more = screen.getByRole("button", { name: "More options" });
    await user.click(more);
    await waitFor(() => expect(screen.getByDisplayValue("Action, Drama")).toBeTruthy());
    expect(screen.getByDisplayValue("Desert epic")).toBeTruthy();
    expect(mockInvoke).toHaveBeenCalledWith("get_tmdb_details", expect.anything());
  });

  it("stores stills and trailer in detailsJson on save", async () => {
    useSettingsStore.setState({ tmdbKeySet: true });
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
    await user.type(screen.getByRole("combobox"), "frieren");
    await waitFor(() => expect(screen.getByRole("option", { name: /Frieren/ })).toBeTruthy());
    await user.click(screen.getByRole("option", { name: /Frieren/ }));
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
    await user.type(screen.getByRole("combobox"), "frieren");
    await waitFor(() => expect(screen.getByRole("option", { name: /Frieren/ })).toBeTruthy());
    await user.click(screen.getByRole("option", { name: /Frieren/ }));
    await user.click(screen.getByRole("tab", { name: "Details" }));
    await user.click(screen.getByRole("button", { name: "More options" }));
    await waitFor(() =>
      expect(screen.getByDisplayValue("Adventure, Male Protagonist")).toBeTruthy()
    );
  });
});

describe("WizardModal public prefill lock", () => {
  const LOCK_STATUSES: CollectionStatusDef[] = [
    ...STATUSES,
    { id: "share_1", label: "Friends", color: "#0ea5e9", order: 9, isCore: false, kind: "public" },
  ];

  it("locks the status selector on a public prefill", async () => {
    const user = userEvent.setup();
    renderWizard({
      statuses: LOCK_STATUSES,
      prefill: { title: "", coverUrl: null, status: "share_1" },
    });
    await user.click(screen.getByRole("tab", { name: "Details" }));
    expect((screen.getByRole("combobox", { name: "Status" }) as HTMLButtonElement).disabled).toBe(
      true
    );
  });

  it("leaves the selector free on a private prefill", async () => {
    const user = userEvent.setup();
    renderWizard({
      statuses: LOCK_STATUSES,
      prefill: { title: "", coverUrl: null, status: "planned" },
    });
    await user.click(screen.getByRole("tab", { name: "Details" }));
    expect((screen.getByRole("combobox", { name: "Status" }) as HTMLButtonElement).disabled).toBe(
      false
    );
  });
});

describe("WizardModal source dropdown", () => {
  it("caps TMDB results at 6 with a count header", async () => {
    useSettingsStore.setState({ tmdbKeySet: true });
    mockInvoke.mockImplementation((cmd: unknown) => {
      if (cmd === "search_tmdb")
        return Promise.resolve(
          Array.from({ length: 8 }, (_, i) => ({
            id: 100 + i,
            title: `Dune Part ${i + 1}`,
            cover_url: null,
            year: 2021,
            mediaType: "movie",
            altTitles: [],
          }))
        );
      return Promise.resolve([]);
    });
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole("button", { name: "TMDB" }));
    await user.type(screen.getByRole("combobox"), "dune");
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(6));
    expect(screen.getAllByText("6 results").length).toBeGreaterThanOrEqual(1);
  });

  it("picks the first result on Enter without arrow navigation", async () => {
    useSettingsStore.setState({ tmdbKeySet: true });
    mockInvoke.mockImplementation((cmd: unknown) => {
      if (cmd === "search_tmdb")
        return Promise.resolve([
          { id: 11, title: "Dune", cover_url: null, year: 2021, mediaType: "movie", altTitles: [] },
          {
            id: 12,
            title: "Dune Messiah",
            cover_url: null,
            year: 2025,
            mediaType: "movie",
            altTitles: [],
          },
        ]);
      if (cmd === "get_tmdb_details")
        return Promise.resolve({
          title: "Dune",
          overview: null,
          year: 2021,
          runtimeMinutes: null,
          genres: [],
          posters: [],
        });
      return Promise.resolve([]);
    });
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole("button", { name: "TMDB" }));
    await user.type(screen.getByRole("combobox"), "dune");
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("tab", { name: "Details" }));
    await waitFor(() => expect(screen.getByDisplayValue("Dune")).toBeTruthy());
  });

  it("shows the empty state when a search finds nothing", async () => {
    useSettingsStore.setState({ tmdbKeySet: true });
    mockInvoke.mockImplementation(() => Promise.resolve([]));
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole("button", { name: "TMDB" }));
    await user.type(screen.getByRole("combobox"), "zzz-no-such-title");
    await waitFor(() => expect(screen.getByText("Nothing found. Try another query.")).toBeTruthy());
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("renders the media type badge and alt title in each row", async () => {
    useSettingsStore.setState({ tmdbKeySet: true });
    mockInvoke.mockImplementation((cmd: unknown) => {
      if (cmd === "search_tmdb")
        return Promise.resolve([
          {
            id: 21,
            title: "Dune",
            cover_url: null,
            year: 2021,
            mediaType: "movie",
            altTitles: ["Dune: Part One"],
          },
        ]);
      return Promise.resolve([]);
    });
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole("button", { name: "TMDB" }));
    await user.type(screen.getByRole("combobox"), "dune");
    await waitFor(() => expect(screen.getByRole("option", { name: /Dune/ })).toBeTruthy());
    const option = screen.getByRole("option", { name: /Dune/ });
    expect(option.textContent).toContain("Movie");
    expect(option.textContent).toContain("Dune: Part One");
    expect(option.textContent).toContain("2021");
  });

  it("renders the row cover through the backend image cache", async () => {
    useSettingsStore.setState({ tmdbKeySet: true });
    mockInvoke.mockImplementation((cmd: unknown) => {
      if (cmd === "search_tmdb")
        return Promise.resolve([
          {
            id: 31,
            title: "Dune",
            cover_url: "https://image.tmdb.org/t/p/w500/dune.jpg",
            year: 2021,
            mediaType: "movie",
            altTitles: [],
          },
        ]);
      if (cmd === "fetch_remote_image")
        return Promise.resolve({ id: "cached_1", path: "C:/images/cached_1.jpg" });
      return Promise.resolve([]);
    });
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole("button", { name: "TMDB" }));
    await user.type(screen.getByRole("combobox"), "dune");
    await waitFor(() => expect(screen.getByRole("option", { name: /Dune/ })).toBeTruthy());
    const option = screen.getByRole("option", { name: /Dune/ });
    const img = option.querySelector("img");
    expect(img?.getAttribute("src")).toContain("asset.localhost");
    expect(mockInvoke).toHaveBeenCalledWith(
      "fetch_remote_image",
      expect.objectContaining({ url: "https://image.tmdb.org/t/p/w92/dune.jpg" })
    );
  });

  it("falls back to the title initial when the cached cover fails", async () => {
    useSettingsStore.setState({ tmdbKeySet: true });
    mockInvoke.mockImplementation((cmd: unknown) => {
      if (cmd === "search_tmdb")
        return Promise.resolve([
          {
            id: 32,
            title: "Dune",
            cover_url: "https://image.tmdb.org/t/p/w500/dune.jpg",
            year: 2021,
            mediaType: "movie",
            altTitles: [],
          },
        ]);
      if (cmd === "fetch_remote_image") return Promise.reject(new Error("no network"));
      return Promise.resolve([]);
    });
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole("button", { name: "TMDB" }));
    await user.type(screen.getByRole("combobox"), "dune");
    await waitFor(() => expect(screen.getByRole("option", { name: /Dune/ })).toBeTruthy());
    const option = screen.getByRole("option", { name: /Dune/ });
    expect(option.querySelector("img")).toBeNull();
    expect(option.textContent).toContain("D");
  });
});
