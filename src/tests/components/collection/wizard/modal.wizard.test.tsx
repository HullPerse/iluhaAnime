import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WizardModalCollection } from "@/routes/components/collection/wizard/modal.wizard";
import { useSettingsStore } from "@/store/settings.store";
import type { CollectionItem, CollectionStatusDef } from "@/types/collection";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

const mockOpenDialog = vi.fn();
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => mockOpenDialog(...args),
}));

// jsdom has no canvas 2D context, so generatePlaceholder would return "".
vi.mock("@/lib/collection.utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/collection.utils")>();
  return {
    ...actual,
    generatePlaceholder: () => "data:image/png;base64,PLACEHOLDER",
  };
});

const STATUSES: CollectionStatusDef[] = [
  { id: "planned", label: "Planned", color: "#9ca3af", order: 0, isCore: true },
  { id: "watching", label: "Watching", color: "#3b82f6", order: 1, isCore: true },
];

function renderWizard(props: Partial<React.ComponentProps<typeof WizardModalCollection>> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <WizardModalCollection
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

describe("WizardModalCollection add mode", () => {
  it("opens on the source tab with a disabled save button", () => {
    renderWizard();
    expect(screen.getByRole("tab", { name: "Source" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Custom" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "AniList" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "TMDB" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
    // Cover tab is mounted, so its hint is absent; only the preview hint shows.
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
        return { id: "blob_1", dataUrl: "data:image/png;base64,AAAA" };
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

describe("WizardModalCollection edit mode", () => {
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
