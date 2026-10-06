import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { usePeerAvatarUrl } from "@/hooks/session/avatar.hook";
import type { AniUserProfile } from "@/types/anilist";

const getProfileMock = vi.hoisted(() => vi.fn());

vi.mock("@/api/anilist.api", () => ({
  anilistApi: {
    getProfile: getProfileMock,
  },
}));

function renderAvatar(anilistUserId: number | null) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => usePeerAvatarUrl(anilistUserId), { wrapper });
}

describe("usePeerAvatarUrl", () => {
  it("returns null without any request when the peer has no linked id", async () => {
    getProfileMock.mockReset();

    const { result } = renderAvatar(null);

    await waitFor(() => expect(result.current).toBeNull());
    expect(getProfileMock).not.toHaveBeenCalled();
  });

  it("returns the public profile avatar for a linked peer", async () => {
    getProfileMock.mockReset();
    getProfileMock.mockResolvedValue({
      avatar: "https://cdn.anilist.co/img.png",
    } as AniUserProfile);

    const { result } = renderAvatar(7);

    await waitFor(() => expect(result.current).toBe("https://cdn.anilist.co/img.png"));
    expect(getProfileMock).toHaveBeenCalledWith(7);
  });

  it("falls back to null when the profile carries no avatar", async () => {
    getProfileMock.mockReset();
    getProfileMock.mockResolvedValue({ avatar: null } as AniUserProfile);

    const { result } = renderAvatar(7);

    await waitFor(() => expect(result.current).toBeNull());
  });

  it("falls back to null when the profile request fails", async () => {
    getProfileMock.mockReset();
    getProfileMock.mockRejectedValue(new Error("network down"));

    const { result } = renderAvatar(7);

    await waitFor(() => expect(result.current).toBeNull());
  });
});
