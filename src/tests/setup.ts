import { beforeEach, vi } from "vitest";

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
} from "./mocks";

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

beforeEach(async () => {
  const { resetTransportInflight, resetTransportStats } = await import("@/api/transport.api");
  const { resetCoverCache } = await import("@/hooks/collection/cache.hook");
  const { resetRemoteImageCache } = await import("@/hooks/remoteImage.hook");
  const { resetCardCache } = await import("@/lib/player/cardCache.utils");
  const { resetSymSpellCache } = await import("@/lib/search/suggestions.utils");
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
