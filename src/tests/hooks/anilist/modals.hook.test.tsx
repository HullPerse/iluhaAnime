import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useAnilistModals } from "@/hooks/anilist/modals.hook";
import {
  consumeDeepLink,
  consumeTorrentDeepLink,
  deeplinkAtoms,
  openAnimeDeepLink,
  openTorrentDeepLink,
} from "@/store/deeplink.store";
import type { AniListId } from "@/types/types";

afterEach(() => {
  cleanup();
  consumeDeepLink();
  consumeTorrentDeepLink();
});

describe("useAnilistModals deep-link takeover", () => {
  it("closes open list modals when an anime link arrives", () => {
    const { result } = renderHook(() => useAnilistModals());
    act(() => {
      result.current.handleOpenModal("spotlight");
      result.current.handleOpenActivity("feed");
    });
    expect(result.current.views.spotlight).toBe(true);
    expect(result.current.views.activity.open).toBe(true);
    act(() => {
      openAnimeDeepLink({ source: "anilist", id: 21 as AniListId });
    });
    expect(result.current.views.spotlight).toBe(false);
    expect(result.current.views.activity.open).toBe(false);
    expect(deeplinkAtoms.target.get()).not.toBeNull();
  });

  it("leaves modals alone for non-anime links", () => {
    const { result } = renderHook(() => useAnilistModals());
    act(() => {
      result.current.handleOpenModal("browse");
    });
    act(() => {
      openTorrentDeepLink({ infoHash: "0".repeat(40) });
    });
    expect(result.current.views.browse).toBe(true);
  });
});
