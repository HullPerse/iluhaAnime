import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WizardModal } from "@/routes/components/collection/wizard/modal.wizard";
import { useNotificationStore } from "@/store/notification.store";
import { useSettingsStore } from "@/store/settings.store";
import type { CollectionItem } from "@/types/collection";

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
  const actual =
    await importOriginal<typeof import("@/lib/collection.utils")>();
  return {
    ...actual,
    generatePlaceholder: () => "data:image/png;base64,PLACEHOLDER",
  };
});

type WizardItem = Omit<CollectionItem, "id" | "addedAt" | "updatedAt">;

function makeItem(overrides: Partial<CollectionItem> = {}): CollectionItem {
  return {
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
    coverUrl: null,
    coverBlobId: null,
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
    ...overrides,
  };
}

function renderWizard(
  props: Partial<React.ComponentProps<typeof WizardModal>> = {}
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <WizardModal
        open
        onClose={vi.fn()}
        onSave={vi.fn()}
        customFieldDefs={[]}
        {...props}
      />
    </QueryClientProvider>
  );
}

afterEach(() => cleanup());

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
  useNotificationStore.setState({ items: [], dismissed: [], unreadCount: 0 });
  mockInvoke.mockReset();
  mockOpenDialog.mockReset();
});

describe("WizardModal add mode", () => {
  it("renders the source panel with a disabled save button and cover hint", () => {
    renderWizard();
    expect(screen.getByText("Source")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Custom" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "AniList" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "TMDB" })).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    // The hint renders in both the cover panel and the preview panel.
    expect(screen.getAllByText("Cover is required to save.")).toHaveLength(2);
    expect(screen.getByText("Title *")).toBeTruthy();
  });

  it("uploads a local cover and saves it with the blob id", async () => {
    mockOpenDialog.mockResolvedValue("C:\\fake\\cover.png");
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "import_user_image") {
        return { id: "blob_1", dataUrl: "data:image/png;base64,AAAA" };
      }
      return null;
    });
    const onSave = vi.fn();
    renderWizard({ onSave });
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Upload image" }));
    expect(await screen.findByAltText("selected")).toBeTruthy();

    await user.type(screen.getByLabelText(/Title/), "Naruto");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(mockOpenDialog).toHaveBeenCalledWith({
      directory: false,
      multiple: false,
      filters: [
        { name: "Image", extensions: ["png", "jpg", "jpeg", "gif", "webp"] },
      ],
    });
    expect(mockInvoke).toHaveBeenCalledWith("import_user_image", {
      path: "C:\\fake\\cover.png",
    });
    expect(mockInvoke).not.toHaveBeenCalledWith(
      "download_remote_image",
      expect.anything()
    );
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved: WizardItem = onSave.mock.calls[0]![0];
    expect(saved.title).toBe("Naruto");
    expect(saved.coverBlobId).toBe("blob_1");
    expect(saved.coverUrl).toBe("data:image/png;base64,AAAA");
  });

  it("shows an error notification when the local upload fails", async () => {
    mockOpenDialog.mockResolvedValue("C:\\fake\\cover.png");
    mockInvoke.mockImplementation(async () => {
      throw new Error("boom");
    });
    renderWizard();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Upload image" }));

    await waitFor(() => {
      expect(useNotificationStore.getState().items[0]?.type).toBe("error");
    });
    expect(screen.queryByAltText("selected")).toBeNull();
  });

  it("pastes a remote URL and downloads it on save", async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "download_remote_image") return { id: "blob_remote" };
      return null;
    });
    const onSave = vi.fn();
    renderWizard({ onSave });
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Paste image URL" }));
    const urlInput = await screen.findByPlaceholderText("https://");
    await user.type(urlInput, "https://example.com/cover.jpg");
    await user.click(screen.getByRole("button", { name: "OK" }));
    expect(await screen.findByAltText("selected")).toBeTruthy();

    await user.type(screen.getByLabelText(/Title/), "Naruto");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(mockInvoke).toHaveBeenCalledWith("download_remote_image", {
      url: "https://example.com/cover.jpg",
      nameHint: "collection-cover",
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved: WizardItem = onSave.mock.calls[0]![0];
    expect(saved.coverBlobId).toBe("blob_remote");
    expect(saved.coverUrl).toBe("https://example.com/cover.jpg");
  });

  it("uses a placeholder cover without downloading anything", async () => {
    const onSave = vi.fn();
    renderWizard({ onSave });
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: "Placeholder with text" })
    );
    expect(await screen.findByAltText("selected")).toBeTruthy();

    await user.type(screen.getByLabelText(/Title/), "Naruto");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(mockInvoke).not.toHaveBeenCalledWith(
      "download_remote_image",
      expect.anything()
    );
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved: WizardItem = onSave.mock.calls[0]![0];
    expect(saved.coverBlobId).toBeNull();
    expect(saved.coverUrl).toBe("data:image/png;base64,PLACEHOLDER");
  });
});

describe("WizardModal edit mode", () => {
  it("prefills fields, hides the source panel, and keeps the existing blob cover", async () => {
    const initial = makeItem({
      title: "Naruto",
      coverUrl: "data:image/png;base64,EXISTING",
      coverBlobId: "blob_existing",
    });
    const onSave = vi.fn();
    const onDelete = vi.fn();
    renderWizard({ initial, onSave, onDelete });
    const user = userEvent.setup();

    expect(screen.queryByText("Source")).toBeNull();
    expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy();
    expect((screen.getByLabelText(/Title/) as HTMLInputElement).value).toBe(
      "Naruto"
    );

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(mockInvoke).not.toHaveBeenCalledWith(
      "download_remote_image",
      expect.anything()
    );
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved: WizardItem = onSave.mock.calls[0]![0];
    expect(saved.title).toBe("Naruto");
    expect(saved.coverBlobId).toBe("blob_existing");
  });

  it("deletes the item from the delete button", async () => {
    const initial = makeItem();
    const onDelete = vi.fn();
    renderWizard({ initial, onDelete });
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(onDelete).toHaveBeenCalledWith("item_1");
  });
});