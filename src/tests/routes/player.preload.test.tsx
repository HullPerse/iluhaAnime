import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const gate = vi.hoisted(() => {
  let release: () => void = () => undefined;
  let started: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  const importing = new Promise<"module-started">((resolve) => {
    started = () => resolve("module-started");
  });

  return { ready, importing, release, started };
});

vi.mock("@/routes/components/player/player.component", async () => {
  gate.started();
  await gate.ready;

  return { default: () => <div data-testid="player-ready">player</div> };
});

import { createAppRouter } from "@/routes/__root";

afterEach(() => {
  gate.release();
  cleanup();
});

it("preloads the player module before declaring its route loaded", async () => {
  const router = createAppRouter(createMemoryHistory({ initialEntries: ["/player-window"] }));
  const loading = router.load();
  const first = await Promise.race([loading.then(() => "route-loaded"), gate.importing]);
  gate.release();
  await loading;
  expect(first).toBe("module-started");
  render(<RouterProvider router={router} />);
  expect(screen.getByTestId("player-ready").textContent).toBe("player");
});
