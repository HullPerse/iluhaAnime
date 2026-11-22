import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Profiler } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { systemApi } from "@/api/system.api";
import SettingsDiagnostics from "@/routes/components/settings/diagnostics.settings";

vi.mock("@/routes/__root.defs", () => ({
  settingsRoute: {
    useNavigate: () => vi.fn(),
    useSearch: () => ({ probe: "anilist-graphql" }),
  },
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("keeps the run controls mounted while a focused diagnostic builds its report", async () => {
  const diagnose = vi.spyOn(systemApi, "diagnoseNetwork").mockRejectedValue(new Error("offline"));
  const commits: string[] = [];
  render(
    <Profiler id="settings-diagnostics" onRender={(_, phase) => commits.push(phase)}>
      <SettingsDiagnostics />
    </Profiler>
  );
  const run = screen.getByRole("button", { name: "Запустить" });
  fireEvent.click(screen.getByRole("button", { name: "Проверить эту пробу" }));
  expect(await screen.findByRole("button", { name: "Повторить" })).toBe(run);
  expect(await screen.findByRole("table")).toBeTruthy();
  expect(diagnose).toHaveBeenCalledExactlyOnceWith(
    "https://graphql.anilist.co",
    null,
    expect.objectContaining({ method: "POST" })
  );
  expect(commits).toEqual([
    "mount",
    "update",
    "nested-update",
    "update",
    "nested-update",
    "update",
    "nested-update",
  ]);
});
