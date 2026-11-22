import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { streamApi } from "@/api/stream.api";
import StreamHistoryModal from "@/routes/components/stream/history.stream";

vi.mock("@/config/system/query.config", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/config/system/query.config")>();

  return {
    ...original,
    QUERY_PRESETS: {
      ...original.QUERY_PRESETS,
      slow: { ...original.QUERY_PRESETS.slow, retry: false },
    },
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("distinguishes a failed history request from a successfully loaded empty history", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const history = vi.spyOn(streamApi, "historyRecent");
  history.mockRejectedValueOnce(new Error("offline")).mockResolvedValue([]);

  render(
    <QueryClientProvider client={client}>
      <StreamHistoryModal open onClose={vi.fn()} onOpen={vi.fn()} />
    </QueryClientProvider>
  );

  expect(await screen.findByRole("alert")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
  await screen.findByText("Пока ничего не просмотрено.");
  expect(screen.queryByRole("alert")).toBeNull();
  expect(history).toHaveBeenCalledTimes(2);
});
