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

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.removeAttribute("style");
  document.documentElement.removeAttribute("style");
});

beforeEach(async () => {
  const { resetTransportInflight, resetTransportStats } = await import("@/api/transport.api");
  const { resetCoverCache } = await import("@/hooks/collection/cache.hook");
  const { resetRemoteImageCache } = await import("@/hooks/remoteImage.hook");
  const { resetCardCache } = await import("@/lib/core/cardCache.utils");
  const { resetSymSpellCache } = await import("@/lib/core/suggestions.utils");
  const { resetNotificationAtoms } = await import("@/store/notification.store");
  const { resetSettingsAtoms } = await import("@/store/settings.store");
  const { resetModalAtoms } = await import("@/store/modal.store");
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
  resetModalAtoms();
  resetUpdateAtoms();
  localStorage.clear();
  sessionStorage.clear();
});
