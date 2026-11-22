import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Profiler } from "react";
import { afterEach, expect, it, vi } from "vitest";

import SettingsZapret from "@/routes/components/settings/zapret.settings";
import { settingsAtoms } from "@/store/settings.store";
import { zapretLocalEndpoint } from "@/config/settings/zapret.config";

const writeText = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText }));

afterEach(cleanup);

it("copies the current local endpoint without remounting its button", async () => {
  const commits: string[] = [];
  render(
    <Profiler id="local-endpoint" onRender={(_, phase) => commits.push(phase)}>
      <SettingsZapret />
    </Profiler>
  );
  const endpoint = zapretLocalEndpoint(settingsAtoms.httpApiPort.get());
  const section = screen.getByText(endpoint).closest("section");

  if (!section) throw new Error("Expected the local endpoint panel");
  const local = within(section);
  const button = local.getByRole("button", { name: "Скопировать" });
  fireEvent.click(button);
  expect(await local.findByRole("button", { name: "Скопировано" })).toBe(button);
  expect(writeText).toHaveBeenCalledExactlyOnceWith(endpoint);
  expect(commits).toEqual(["mount", "update"]);
});
