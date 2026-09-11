import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, type Ref } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DitherSettings from "@/routes/components/search/modern/dither/settings.dither";
import { useNotificationStore } from "@/store/notification.store";
import { useSettingsStore } from "@/store/settings.store";
import type { UserImageFile } from "@/types/image.userimage";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

const mockOpenDialog = vi.fn();
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => mockOpenDialog(...args),
}));

vi.mock("@/components/shared/dither.component", () => {
  function MockDitherCanvas({
    onReady,
    ref,
  }: {
    onReady?: () => void;
    ref?: Ref<HTMLCanvasElement>;
  }) {
    useEffect(() => {
      onReady?.();
    }, [onReady]);
    return <canvas data-testid="preview-canvas" ref={ref} />;
  }
  return { default: MockDitherCanvas };
});

const FIRST: UserImageFile = {
  id: "aaa",
  name: "first.png",
  mimeType: "image/png",
  path: "C:/images/aaa.png",
  originalPath: "C:/images/aaa.original.png",
  ditherOptions: null,
  createdAt: 10,
};

const SECOND: UserImageFile = {
  id: "bbb",
  name: "second.jpg",
  mimeType: "image/jpeg",
  path: "C:/images/bbb.jpg",
  originalPath: null,
  ditherOptions: null,
  createdAt: 5,
};

const THIRD: UserImageFile = {
  id: "ccc",
  name: "third.gif",
  mimeType: "image/gif",
  path: "C:/images/ccc.gif",
  originalPath: null,
  ditherOptions: null,
  createdAt: 3,
};

const FOURTH: UserImageFile = {
  id: "ddd",
  name: "fourth.webp",
  mimeType: "image/webp",
  path: "C:/images/ddd.webp",
  originalPath: null,
  ditherOptions: null,
  createdAt: 1,
};

function serveLibrary(rows: UserImageFile[]) {
  const metas = rows.map((row) => ({
    id: row.id,
    name: row.name,
    mimeType: row.mimeType,
    hasOriginal: row.originalPath !== null,
    createdAt: row.createdAt,
  }));
  const byId = new Map(rows.map((row) => [row.id, row]));
  return async (cmd: string, args?: { ids?: string[] }) => {
    if (cmd === "list_dither_image_meta") return metas;
    if (cmd === "get_dither_images")
      return (args?.ids ?? []).map((id) => byId.get(id)).filter((row) => row !== undefined);
    return null;
  };
}

function renderPanel(onClose: () => void = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DitherSettings onClose={onClose} />
    </QueryClientProvider>
  );
}

function errorMessages() {
  return useNotificationStore
    .getState()
    .items.filter((item) => item.type === "error")
    .map((item) => item.message);
}

afterEach(() => cleanup());

beforeEach(() => {
  useSettingsStore.setState({ language: "en", selectedDitherId: null });
  useNotificationStore.setState({ items: [], unreadCount: 0, dismissed: [] });
  mockInvoke.mockReset();
  mockOpenDialog.mockReset();
});

describe("DitherSettings database images", () => {
  it("loads meta on mount and rows for the visible page", async () => {
    mockInvoke.mockImplementation(serveLibrary([FIRST, SECOND]));
    renderPanel();
    expect(screen.getByText("Loading images...")).toBeTruthy();
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("list_dither_image_meta", undefined)
    );
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("get_dither_images", { ids: ["aaa", "bbb"] })
    );
    expect(screen.getByAltText("first.png")).toBeTruthy();
    expect(screen.getByAltText("second.jpg")).toBeTruthy();
    expect(screen.queryByText("Loading images...")).toBeNull();
    expect(screen.getByAltText("Placeholder")).toBeTruthy();
  });

  it("renders only the placeholder when the table is empty", async () => {
    mockInvoke.mockResolvedValue([]);
    renderPanel();
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("list_dither_image_meta", undefined)
    );
    await waitFor(() => expect(screen.queryByText("Loading images...")).toBeNull());
    expect(screen.getByAltText("Placeholder")).toBeTruthy();
    expect(mockInvoke).not.toHaveBeenCalledWith("get_dither_images", expect.anything());
  });

  it("notifies when the meta list fails to load", async () => {
    mockInvoke.mockRejectedValue(new Error("db gone"));
    renderPanel();
    await waitFor(() => expect(errorMessages()).toContain("Could not load images."));
    expect(screen.getByAltText("Placeholder")).toBeTruthy();
  });

  it("fetches the next page on demand and reuses cached rows on the way back", async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation(serveLibrary([FIRST, SECOND, THIRD, FOURTH]));
    renderPanel();
    await waitFor(() => expect(screen.getByAltText("second.jpg")).toBeTruthy());
    expect(mockInvoke).toHaveBeenCalledWith("get_dither_images", { ids: ["aaa", "bbb"] });
    await user.click(screen.getByTitle("Next"));
    await waitFor(() => expect(screen.getByAltText("third.gif")).toBeTruthy());
    expect(mockInvoke).toHaveBeenCalledWith("get_dither_images", { ids: ["ccc", "ddd"] });
    expect(screen.queryByAltText("first.png")).toBeNull();
    const calls = mockInvoke.mock.calls.filter(([cmd]) => cmd === "get_dither_images").length;
    await user.click(screen.getByTitle("Previous"));
    await waitFor(() => expect(screen.getByAltText("first.png")).toBeTruthy());
    expect(mockInvoke.mock.calls.filter(([cmd]) => cmd === "get_dither_images").length).toBe(calls);
  });

  it("uploads a picked file and prepends it to the list", async () => {
    const user = userEvent.setup();
    const serve = serveLibrary([SECOND]);
    mockInvoke.mockImplementation(serve);
    mockOpenDialog.mockResolvedValue("C:\\fake\\new.png");
    renderPanel();
    await waitFor(() => expect(screen.getByAltText("second.jpg")).toBeTruthy());
    const added: UserImageFile = { ...FIRST, id: "eee", name: "new.png" };
    mockInvoke.mockImplementation(async (cmd: string, args?: { ids?: string[] }) => {
      if (cmd === "import_dither_image") return added;
      return serve(cmd, args);
    });
    await user.click(screen.getByTitle("Add"));
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("import_dither_image", {
        path: "C:\\fake\\new.png",
      })
    );
    expect(screen.getByAltText("new.png")).toBeTruthy();
    expect(screen.getByAltText("second.jpg")).toBeTruthy();
  });

  it("shows an uploading placeholder with the file name while importing", async () => {
    const user = userEvent.setup();
    mockOpenDialog.mockResolvedValue("C:\\fake\\slow.png");
    let resolveImport!: (value: UserImageFile) => void;
    const serve = serveLibrary([SECOND]);
    mockInvoke.mockImplementation(async (cmd: string, args?: { ids?: string[] }) => {
      if (cmd === "import_dither_image")
        return new Promise<UserImageFile>((resolve) => {
          resolveImport = resolve;
        });
      return serve(cmd, args);
    });
    renderPanel();
    await waitFor(() => expect(screen.getByAltText("second.jpg")).toBeTruthy());
    await user.click(screen.getByTitle("Add"));
    await waitFor(() => expect(screen.getByText("slow.png")).toBeTruthy());
    expect(screen.getByLabelText("Uploading image...")).toBeTruthy();
    expect((screen.getByTitle("Add") as HTMLButtonElement).disabled).toBe(true);
    resolveImport(FIRST);
    await waitFor(() => expect(screen.getByAltText("first.png")).toBeTruthy());
    expect(screen.queryByText("slow.png")).toBeNull();
    expect((screen.getByTitle("Add") as HTMLButtonElement).disabled).toBe(false);
  });

  it("notifies when import fails and keeps the list", async () => {
    const user = userEvent.setup();
    const serve = serveLibrary([SECOND]);
    mockInvoke.mockImplementation(async (cmd: string, args?: { ids?: string[] }) => {
      if (cmd === "import_dither_image") throw new Error("unsupported");
      return serve(cmd, args);
    });
    mockOpenDialog.mockResolvedValue("C:\\fake\\bad.png");
    renderPanel();
    await waitFor(() => expect(screen.getByAltText("second.jpg")).toBeTruthy());
    await user.click(screen.getByTitle("Add"));
    await waitFor(() => expect(errorMessages()).toContain("Could not save the image. Try again."));
    expect(screen.getByAltText("second.jpg")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
  });

  it("does nothing when the dialog is cancelled", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue([]);
    mockOpenDialog.mockResolvedValue(null);
    renderPanel();
    await waitFor(() => expect(screen.queryByText("Loading images...")).toBeNull());
    await user.click(screen.getByTitle("Add"));
    expect(mockInvoke).not.toHaveBeenCalledWith("import_dither_image", expect.anything());
    expect(errorMessages()).toHaveLength(0);
  });

  it("deletes the selected image and clears the selection", async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation(serveLibrary([FIRST, SECOND]));
    renderPanel();
    await waitFor(() => expect(screen.getByAltText("first.png")).toBeTruthy());
    expect((screen.getByTitle("Delete") as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByAltText("first.png"));
    expect((screen.getByTitle("Delete") as HTMLButtonElement).disabled).toBe(false);
    await user.click(screen.getByTitle("Delete"));
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("delete_dither_image", { id: "aaa" })
    );
    expect(screen.queryByAltText("first.png")).toBeNull();
    expect(screen.getByAltText("second.jpg")).toBeTruthy();
    expect((screen.getByTitle("Delete") as HTMLButtonElement).disabled).toBe(true);
  });

  it("notifies when delete fails and keeps the image", async () => {
    const user = userEvent.setup();
    const serve = serveLibrary([FIRST]);
    mockInvoke.mockImplementation(async (cmd: string, args?: { ids?: string[] }) => {
      if (cmd === "delete_dither_image") throw new Error("db locked");
      return serve(cmd, args);
    });
    renderPanel();
    await waitFor(() => expect(screen.getByAltText("first.png")).toBeTruthy());
    await user.click(screen.getByAltText("first.png"));
    await user.click(screen.getByTitle("Delete"));
    await waitFor(() => expect(errorMessages()).toContain("db locked"));
    expect(screen.getByAltText("first.png")).toBeTruthy();
  });

  it("disables delete and edit for the permanent placeholder", async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation(serveLibrary([SECOND]));
    renderPanel();
    await waitFor(() => expect(screen.getByAltText("Placeholder")).toBeTruthy());
    await user.click(screen.getByAltText("Placeholder"));
    expect((screen.getByTitle("Delete") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTitle("Edit") as HTMLButtonElement).disabled).toBe(true);
    expect(mockInvoke).not.toHaveBeenCalledWith("delete_dither_image", expect.anything());
  });

  it("saves the selection into settings and closes", async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation(serveLibrary([FIRST]));
    const onClose = vi.fn();
    renderPanel(onClose);
    await waitFor(() => expect(screen.getByAltText("first.png")).toBeTruthy());
    await user.click(screen.getByAltText("first.png"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(useSettingsStore.getState().selectedDitherId).toBe("aaa");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("preselects the stored selection on open", async () => {
    useSettingsStore.setState({ selectedDitherId: "bbb" });
    mockInvoke.mockImplementation(serveLibrary([FIRST, SECOND]));
    renderPanel();
    await waitFor(() => expect(screen.getByAltText("second.jpg")).toBeTruthy());
    expect((screen.getByTitle("Delete") as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByTitle("Edit") as HTMLButtonElement).disabled).toBe(false);
  });

  it("selects the placeholder when nothing is stored", async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation(serveLibrary([FIRST]));
    const onClose = vi.fn();
    renderPanel(onClose);
    await waitFor(() => expect(screen.getByAltText("Placeholder")).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(useSettingsStore.getState().selectedDitherId).toBe("placeholder");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("falls back to the placeholder after deleting the selection", async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation(serveLibrary([FIRST]));
    renderPanel();
    await waitFor(() => expect(screen.getByAltText("first.png")).toBeTruthy());
    await user.click(screen.getByAltText("first.png"));
    await user.click(screen.getByTitle("Delete"));
    await waitFor(() => expect(screen.queryByAltText("first.png")).toBeNull());
    expect((screen.getByTitle("Delete") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTitle("Edit") as HTMLButtonElement).disabled).toBe(true);
  });

  it("opens the editor from the cached page row without a single fetch", async () => {
    const user = userEvent.setup();
    const baked: UserImageFile = { ...FIRST, path: "C:/images/aaa.baked.png" };
    const serve = serveLibrary([FIRST]);
    mockInvoke.mockImplementation(async (cmd: string, args?: { ids?: string[] }) => {
      if (cmd === "update_dither_image_data") return baked;
      return serve(cmd, args);
    });
    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => "data:image/png;base64,BAKED");
    renderPanel();
    await waitFor(() => expect(screen.getByAltText("first.png")).toBeTruthy());
    await user.click(screen.getByAltText("first.png"));
    await user.click(screen.getByTitle("Edit"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Deep" })).toBeTruthy());
    expect(mockInvoke).not.toHaveBeenCalledWith("get_dither_image", expect.anything());
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByAltText("first.png")).toBeTruthy());
    expect(mockInvoke).toHaveBeenCalledWith("update_dither_image_data", {
      id: "aaa",
      dataUrl: "data:image/png;base64,BAKED",
    });
  });

  it("resolves an off-page selection through a single fetch", async () => {
    const user = userEvent.setup();
    useSettingsStore.setState({ selectedDitherId: "ddd" });
    const serve = serveLibrary([FIRST, SECOND, THIRD, FOURTH]);
    mockInvoke.mockImplementation(async (cmd: string, args?: { ids?: string[] }) => {
      if (cmd === "get_dither_image") return FOURTH;
      return serve(cmd, args);
    });
    renderPanel();
    await waitFor(() => expect(screen.getByAltText("first.png")).toBeTruthy());
    expect((screen.getByTitle("Edit") as HTMLButtonElement).disabled).toBe(false);
    await user.click(screen.getByTitle("Edit"));
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("get_dither_image", { id: "ddd" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Deep" })).toBeTruthy());
  });

  it("notifies when an off-page selection no longer exists", async () => {
    const user = userEvent.setup();
    useSettingsStore.setState({ selectedDitherId: "stale" });
    const serve = serveLibrary([FIRST]);
    mockInvoke.mockImplementation(async (cmd: string, args?: { ids?: string[] }) => {
      if (cmd === "get_dither_image") throw new Error("dither image not found");
      return serve(cmd, args);
    });
    renderPanel();
    await waitFor(() => expect(screen.getByAltText("first.png")).toBeTruthy());
    await user.click(screen.getByTitle("Edit"));
    await waitFor(() => expect(errorMessages()).toContain("Could not load images."));
    expect(screen.queryByRole("button", { name: "Deep" })).toBeNull();
  });

  it("bakes through a hidden full-frame canvas while saving", async () => {
    const user = userEvent.setup();
    const baked: UserImageFile = { ...FIRST, path: "C:/images/aaa.baked.png" };
    const serve = serveLibrary([FIRST]);
    let resolveUpdate!: (value: UserImageFile) => void;
    mockInvoke.mockImplementation(async (cmd: string, args?: { ids?: string[] }) => {
      if (cmd === "update_dither_image_data")
        return new Promise<UserImageFile>((resolve) => {
          resolveUpdate = resolve;
        });
      return serve(cmd, args);
    });
    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => "data:image/png;base64,BAKED");
    renderPanel();
    await waitFor(() => expect(screen.getByAltText("first.png")).toBeTruthy());
    await user.click(screen.getByAltText("first.png"));
    await user.click(screen.getByTitle("Edit"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Deep" })).toBeTruthy());
    expect(screen.getAllByTestId("preview-canvas")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getAllByTestId("preview-canvas")).toHaveLength(2));
    resolveUpdate(baked);
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("update_dither_image_data", {
        id: "aaa",
        dataUrl: "data:image/png;base64,BAKED",
      })
    );
    await waitFor(() => expect(screen.getByAltText("first.png")).toBeTruthy());
  });

  it("applies a display preset to the wallpaper filters", async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation(serveLibrary([FIRST]));
    renderPanel();
    await waitFor(() => expect(screen.getByAltText("first.png")).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Dark" }));
    expect(useSettingsStore.getState().wallpaperFilters.brightness).toBe(55);
  });

  it("toggles search shadow sides", async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation(serveLibrary([FIRST]));
    renderPanel();
    await waitFor(() => expect(screen.getByAltText("first.png")).toBeTruthy());
    const tops = screen.getAllByRole("checkbox", { name: "Top" });
    expect(tops).toHaveLength(2);
    await user.click(tops[0]);
    expect(useSettingsStore.getState().searchShadow.sides.top).toBe(true);
    expect(useSettingsStore.getState().wallpaperShadow.sides.top).toBe(false);
  });

  it("toggles wallpaper parallax and scanlines", async () => {
    const user = userEvent.setup();
    useSettingsStore.setState({ wallpaperParallax: true, wallpaperScanlines: false });
    mockInvoke.mockImplementation(serveLibrary([FIRST]));
    renderPanel();
    await waitFor(() => expect(screen.getByAltText("first.png")).toBeTruthy());
    await user.click(screen.getByRole("checkbox", { name: "Parallax" }));
    expect(useSettingsStore.getState().wallpaperParallax).toBe(false);
    await user.click(screen.getByRole("checkbox", { name: "Scanlines" }));
    expect(useSettingsStore.getState().wallpaperScanlines).toBe(true);
  });
});
