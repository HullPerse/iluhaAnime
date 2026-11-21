import { cleanup, configure } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

configure({ asyncUtilTimeout: 5000 });

import {
  mockConvertFileSrc,
  mockDialogConfirm,
  mockDialogOpen,
  mockDialogSave,
  mockEmit,
  mockInvoke,
  mockListen,
  mockOpenPath,
  mockOpenUrl,
  mockReadText,
  mockUpdaterCheck,
  mockWriteImage,
  mockWriteText,
  resetAllSharedMocks,
} from "@/tests/mocks";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
  convertFileSrc: mockConvertFileSrc,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: mockListen,
  emit: mockEmit,
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: mockDialogOpen,
  save: mockDialogSave,
  confirm: mockDialogConfirm,
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openPath: mockOpenPath,
  openUrl: mockOpenUrl,
}));

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: mockWriteText,
  readText: mockReadText,
  writeImage: mockWriteImage,
}));

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: mockUpdaterCheck,
}));

const tauriCallbacks = new Map<number, (event: unknown) => void>();
let tauriCallbackId = 1;

Object.defineProperty(window, "__TAURI_INTERNALS__", {
  configurable: true,
  value: {
    invoke: (command: string, args?: Record<string, unknown>) => {
      if (command === "plugin:dialog|open") return mockDialogOpen(args?.options);
      if (command === "plugin:dialog|save") return mockDialogSave(args?.options);
      if (command === "plugin:dialog|message") {
        return Promise.resolve(mockDialogConfirm(args?.message, args)).then((ok) =>
          ok ? "Ok" : "Cancel"
        );
      }
      if (command === "plugin:event|listen") {
        const event = args?.event;
        const handlerId = args?.handler;
        const handler =
          typeof handlerId === "number" ? tauriCallbacks.get(handlerId) : undefined;
        if (typeof event === "string" && handler) mockListen(event, handler);
        return 1;
      }
      if (command === "plugin:event|unlisten") return null;
      const normalized = args && Object.keys(args).length > 0 ? args : undefined;
      return mockInvoke(command, normalized);
    },
    convertFileSrc: mockConvertFileSrc,
    transformCallback: vi.fn((callback: (event: unknown) => void) => {
      const id = tauriCallbackId++;
      tauriCallbacks.set(id, callback);
      return id;
    }),
    unregisterCallback: vi.fn(),
  },
});

Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
  configurable: true,
  value: { unregisterListener: vi.fn() },
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.removeAttribute("style");
  document.documentElement.removeAttribute("style");
});

beforeEach(async () => {
  const { resetTransportInflight, resetTransportStats } = await import("@/api/transport.api");
  const { DEFAULT_STREAM_FILTERS } = await import("@/config/player/streamFilters.config");
  const { streamFilters, streamPage, streamQuery, streamSlug } =
    await import("@/store/stream.store");
  const { resetCoverCache } = await import("@/hooks/coverCache.hook");
  const { resetRemoteImageCache } = await import("@/hooks/remoteImage.hook");
  const { resetCardCache } = await import("@/lib/core/player/cardCache.utils");
  const { resetSymSpellCache } = await import("@/lib/core/anilist/suggestions.utils");
  const { resetNotificationAtoms } = await import("@/store/notification.store");
  const { resetSettingsAtoms, patchSettings } = await import("@/store/settings.store");
  const { resetUpdateAtoms } = await import("@/store/update.store");
  resetAllSharedMocks();
  resetTransportInflight();
  resetTransportStats();
  resetCardCache();
  resetCoverCache();
  resetRemoteImageCache();
  resetSymSpellCache();
  resetNotificationAtoms();
  resetSettingsAtoms();
  patchSettings({ language: "ru" });
  resetUpdateAtoms();
  streamSlug.set(null);
  streamPage.set(1);
  streamQuery.set("");
  streamFilters.set({ ...DEFAULT_STREAM_FILTERS });
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
  localStorage.clear();
  sessionStorage.clear();
});
