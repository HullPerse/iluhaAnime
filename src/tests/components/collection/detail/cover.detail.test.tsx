// @vitest-environment jsdom

import type * as TauriCore from "@tauri-apps/api/core";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetCoverCache } from "@/hooks/collection/cache.hook";
import { resetRemoteImageCache } from "@/hooks/remoteImage.hook";
import { assetUrl } from "@/lib/utils/image.utils";
import { DetailCoverCollection } from "@/routes/components/collection/detail/cover.detail";
import { useSettingsStore } from "@/store/settings.store";
import type { CollectionItem } from "@/types/collection";

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", async (importOriginal) => {
  const actual = await importOriginal<typeof TauriCore>();
  return {
    ...actual,
    invoke: (...args: unknown[]) => mockInvoke(...args),
  };
});

afterEach(() => {
  cleanup();
  mockInvoke.mockReset();
});

beforeEach(() => {
  resetCoverCache();
  resetRemoteImageCache();
  useSettingsStore.setState({ tmdbProxyUrl: null });
});

const coverItem = (coverUrl: string) =>
  ({
    title: "Sousou no Frieren",
    coverUrl,
    coverBlobId: null,
    thumbBlobId: null,
  }) as unknown as CollectionItem;

describe("DetailCoverCollection", () => {
  it("reserves a fixed-size slot while the backend cover resolves", async () => {
    useSettingsStore.setState({ tmdbProxyUrl: "http://127.0.0.1:10809" });
    // The tsconfig lib predates es2024, so Promise.withResolvers has no types here.
    let resolveDownload!: (value: unknown) => void;
    let resolveFetch!: (value: unknown) => void;
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "download_remote_image")
        return new Promise((resolve) => (resolveDownload = resolve));
      if (cmd === "fetch_remote_image")
        return new Promise((resolve) => (resolveFetch = resolve));
      return Promise.reject(new Error(`unexpected ${cmd}`));
    });
    const { container } = render(
      <DetailCoverCollection item={coverItem("https://image.tmdb.org/t/p/w500/pending.jpg")} />
    );
    expect(container.querySelector(".h-54.w-36")).not.toBeNull();
    resolveFetch({ id: "r1", path: "C:/images/remote.jpg" });
    resolveDownload({ id: "c1", path: "C:/images/cached.jpg" });
    await vi.waitFor(() => {
      expect(container.querySelector("img")?.getAttribute("src")).toBe(
        assetUrl("C:/images/cached.jpg")
      );
    });
  });

  it("shows the direct cover url without a proxy while the download is pending", () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "download_remote_image") return new Promise(() => {});
      return Promise.reject(new Error(`unexpected ${cmd}`));
    });
    const { container } = render(
      <DetailCoverCollection item={coverItem("https://image.tmdb.org/t/p/w500/direct.jpg")} />
    );
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://image.tmdb.org/t/p/w500/direct.jpg"
    );
  });

  it("falls back to the direct url when the backend cache fails", async () => {
    useSettingsStore.setState({ tmdbProxyUrl: "http://127.0.0.1:10809" });
    mockInvoke.mockRejectedValue(new Error("offline"));
    const { container } = render(
      <DetailCoverCollection item={coverItem("https://image.tmdb.org/t/p/w500/offline.jpg")} />
    );
    await vi.waitFor(() => {
      expect(container.querySelector("img")?.getAttribute("src")).toBe(
        "https://image.tmdb.org/t/p/w500/offline.jpg"
      );
    });
  });
});
