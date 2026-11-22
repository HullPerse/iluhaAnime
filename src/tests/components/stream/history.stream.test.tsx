import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import StreamHistoryModal from "@/routes/components/stream/history.stream";
import { patchSettings } from "@/store/settings.store";
import type { StreamHistoryEntry } from "@/types/player/stream";

vi.mock("@/hooks/remoteImage.hook", () => ({
  useStreamCover: () => null,
  resetRemoteImageCache: () => undefined,
}));

const history = vi.hoisted(() => ({
  rows: [] as StreamHistoryEntry[],
  refetch: vi.fn(),
  clear: vi.fn(async () => undefined),
}));

vi.mock("@/hooks/stream/catalog.hook", () => ({
  useStreamHistoryRecent: () => ({
    data: history.rows,
    isPending: false,
    isSuccess: true,
    refetch: history.refetch,
  }),
}));

vi.mock("@/api/stream.api", () => ({ streamApi: { historyClear: history.clear } }));

const ROW: StreamHistoryEntry = {
  animeId: "21371",
  episodeId: "9001",
  slug: "21371--sousou-no-frieren-anime",
  title: "Sousou no Frieren",
  episodeNumber: 3,
  episodeTitle: "Killing Magic",
  position: 600,
  duration: 1440,
  updatedAt: 100,
};

const renderHistory = (open = true) => {
  const onOpen = vi.fn();
  const onClose = vi.fn();
  const result = render(<StreamHistoryModal open={open} onOpen={onOpen} onClose={onClose} />);

  return { ...result, onOpen, onClose };
};

beforeEach(() => {
  patchSettings({ language: "ru" });
  history.rows = [ROW];
  history.refetch.mockClear();
  history.clear.mockClear();
});

afterEach(() => {
  cleanup();
});

describe("StreamHistoryModal", () => {
  it("lists a remembered episode and opens its title", () => {
    const { onOpen } = renderHistory();

    expect(screen.getByText("Sousou no Frieren")).toBeDefined();
    expect(screen.getByText("Серия 3, Killing Magic")).toBeDefined();
    expect(screen.getByText("Продолжить с 10:00")).toBeDefined();

    const row = screen.getByText("Sousou no Frieren").closest("[role='button']");
    expect(row).not.toBeNull();
    fireEvent.click(row as HTMLElement);
    expect(onOpen).toHaveBeenCalledWith(ROW.slug);
  });

  it("marks a finished episode as watched", () => {
    history.rows = [{ ...ROW, position: 1440 }];
    renderHistory();

    expect(screen.getByText("Просмотрено")).toBeDefined();
    expect(screen.queryByText("Продолжить с 10:00")).toBeNull();
  });

  it("explains an empty history", () => {
    history.rows = [];
    renderHistory();

    expect(screen.getByText("Пока ничего не просмотрено.")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Очистить историю" })).toBeNull();
  });

  it("clears the history from the header and reloads the list", async () => {
    renderHistory();

    fireEvent.click(screen.getByRole("button", { name: "Очистить историю" }));

    await waitFor(() => expect(history.clear).toHaveBeenCalledTimes(1));
    expect(history.refetch).toHaveBeenCalledTimes(1);
  });
});
