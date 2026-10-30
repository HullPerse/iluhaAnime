import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Update } from "@tauri-apps/plugin-updater";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { translate } from "@/lib/locale/i18n.utils";
import { queryKeys } from "@/lib/core/keys.utils";
import { SettingsSummary } from "@/routes/components/settings/summary.settings";
import { notificationAtoms } from "@/store/notification.store";
import { patchSettings } from "@/store/settings.store";
import { updateAtoms } from "@/store/update.store";
import type { SqliteDatabaseInfo } from "@/types/core/sqlite";

import { mockUpdaterCheck } from "@/tests/mocks";

const ONLINE = Object.getOwnPropertyDescriptor(window.navigator, "onLine");

const DATABASE: SqliteDatabaseInfo = {
  id: "main",
  label: "main",
  fileName: "app_data.sqlite3",
  available: true,
  sizeBytes: 2048,
  tables: [],
};

const renderSummary = (seed: Update | null = null) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData<Update | null>(queryKeys.appUpdates(), seed);
  queryClient.setQueryData(queryKeys.summaryVersion(), "5.0.0");
  queryClient.setQueryData(queryKeys.summaryFfprobe(), true);
  queryClient.setQueryData(queryKeys.summaryStorage(), {
    database: DATABASE,
    backups: [],
    images: { bytes: 0, count: 0 },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SettingsSummary onJump={() => {}} />
    </QueryClientProvider>
  );
};

const checkButton = (): HTMLElement => {
  return screen.getByRole("button", { name: translate("en", "updater.check") });
};

beforeEach(() => {
  patchSettings({ language: "en" });
  mockUpdaterCheck.mockResolvedValue(null);
});

afterEach(() => {
  cleanup();
  if (ONLINE) Object.defineProperty(window.navigator, "onLine", ONLINE);
});

describe("SettingsSummary", () => {
  it("shows the version, ffmpeg and storage facts without removed appearance rows", async () => {
    renderSummary();

    expect(await screen.findByText("5.0.0")).not.toBeNull();
    expect(
      await screen.findByText(translate("en", "settings.summary.ffmpeg.installed"))
    ).not.toBeNull();
    expect(await screen.findByText("app_data.sqlite3")).not.toBeNull();
    expect(screen.queryByText("Theme")).toBeNull();
    expect(screen.queryByText("Learning")).toBeNull();
  });

  it("reports an up-to-date result with a toast when the check finds nothing", async () => {
    renderSummary();

    await userEvent.click(checkButton());

    await waitFor(() => {
      expect(notificationAtoms.items.get()).toContainEqual(
        expect.objectContaining({
          type: "info",
          title: translate("en", "updater.title"),
          message: translate("en", "updater.check.none"),
        })
      );
    });
    expect(mockUpdaterCheck).toHaveBeenCalledTimes(1);
    expect(updateAtoms.promptOpen.get()).toBe(false);
  });

  it("opens the prompt for a found update and reuses it on the next click", async () => {
    const update = { version: "5.1.0", currentVersion: "5.0.0" } as unknown as Update;
    mockUpdaterCheck.mockResolvedValue(update);
    renderSummary();

    await userEvent.click(checkButton());

    const updateButton = await screen.findByRole("button", {
      name: translate("en", "updater.update"),
    });
    expect(updateAtoms.promptOpen.get()).toBe(true);
    expect(mockUpdaterCheck).toHaveBeenCalledTimes(1);

    await userEvent.click(updateButton);

    expect(updateAtoms.promptOpen.get()).toBe(true);
    expect(mockUpdaterCheck).toHaveBeenCalledTimes(1);
  });

  it("surfaces a failed check as an error toast", async () => {
    mockUpdaterCheck.mockRejectedValue(new Error("network down"));
    renderSummary();

    await userEvent.click(checkButton());

    await waitFor(() => {
      expect(notificationAtoms.items.get()).toContainEqual(
        expect.objectContaining({
          type: "error",
          title: translate("en", "updater.check.error"),
          message: "network down",
        })
      );
    });
  });

  it("disables the update check while offline", async () => {
    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
    renderSummary();

    expect((checkButton() as HTMLButtonElement).disabled).toBe(true);
    expect(mockUpdaterCheck).not.toHaveBeenCalled();
  });
});
