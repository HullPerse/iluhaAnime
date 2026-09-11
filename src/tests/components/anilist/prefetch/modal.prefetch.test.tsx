import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import PrefetchRelationsModal from "@/routes/components/anilist/prefetch/modal.prefetch";

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: () => Promise.resolve(() => {}),
}));

afterEach(() => {
  cleanup();
  mockInvoke.mockReset();
});

function baseInvoke(cmd: string): Promise<unknown> {
  if (cmd === "get_app_cache") return Promise.resolve(null);
  if (cmd === "put_app_cache" || cmd === "delete_app_cache") return Promise.resolve(true);
  return Promise.resolve(null);
}

describe("PrefetchRelationsModal background", () => {
  it("starts with deduped ids", async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "prefetch_anime_relations") return new Promise(() => {});
      return baseInvoke(cmd);
    });
    render(<PrefetchRelationsModal animeIds={[1, 1, 2]} onClose={() => {}} />);
    await user.click(screen.getByRole("button", { name: /Начать|Start/ }));
    expect(mockInvoke).toHaveBeenCalledWith("prefetch_anime_relations", { animeIds: [1, 2] });
  });

  it("reattaches to an already running prefetch instead of erroring", async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "prefetch_anime_relations")
        return Promise.reject(new Error("Prefetch already running"));
      return baseInvoke(cmd);
    });
    render(<PrefetchRelationsModal animeIds={[1]} onClose={() => {}} />);
    await user.click(screen.getByRole("button", { name: /Начать|Start/ }));
    const notices = await screen.findAllByText("Continue in background");
    expect(notices.length).toBe(2);
    expect(screen.queryByText(/Error|Ошибка/)).toBeNull();
  });

  it("offers continue from a stored snapshot", async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_app_cache")
        return Promise.resolve({
          payload: JSON.stringify({ ids: [5, 6], done: 10, total: 40 }),
        });
      if (cmd === "prefetch_anime_relations") return new Promise(() => {});
      return baseInvoke(cmd);
    });
    render(<PrefetchRelationsModal animeIds={[5, 6]} onClose={() => {}} />);
    const resume = await screen.findByRole("button", { name: /Продолжить|Continue/ });
    await user.click(resume);
    expect(mockInvoke).toHaveBeenCalledWith("prefetch_anime_relations", {
      animeIds: [5, 6],
    });
  });
});
