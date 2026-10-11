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
  mockWriteImage,
  mockWriteText,
  resetAllSharedMocks,
} from "./mocks";
import { beforeEach, vi } from "vitest";

// Worker-wide Tauri mocks, all delegating to the shared singletons in
// `./mocks`. A test file's own `vi.mock()` for the same path overrides these
// (verified: file factories win over setup factories), so files keep their
// exact behavior while files without their own mock get deterministic funnel
// defaults instead of export-missing undefineds. This only matters with
// `isolate: false`, where the module registry is shared per worker.
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

beforeEach(async () => {
  // Reproduces fresh-mock + fresh-environment semantics for every test:
  // cleared histories, cleared implementations (files set their own after
  // this hook, since setup hooks run before file hooks), default
  // convertFileSrc mapping, emptied module-level caches, and empty web
  // storage like a fresh jsdom.
  //
  // The reset helpers are imported lazily on purpose: a static import would
  // evaluate those SUT modules when setup loads, i.e. before any test file's
  // `vi.mock()` factories apply, freezing unmocked bindings into the shared
  // registry. By the time this hook runs the test file's imports (and its
  // mocks) are already evaluated, so these resolve to the same instances.
  const { resetTransportInflight, resetTransportStats } = await import(
    "@/api/transport.api"
  );
  const { resetCoverCache } = await import("@/hooks/collection/cache.hook");
  const { resetRemoteImageCache } = await import("@/hooks/remoteImage.hook");
  const { resetCardCache } = await import("@/lib/player/cardCache.utils");
  const { resetSymSpellCache } = await import("@/lib/search/suggestions.utils");
  const { resetNotificationAtoms } = await import("@/store/notification.store");
  const { resetSettingsAtoms } = await import("@/store/settings.store");
  resetAllSharedMocks();
  resetTransportInflight();
  resetTransportStats();
  resetCardCache();
  resetCoverCache();
  resetRemoteImageCache();
  resetSymSpellCache();
  resetNotificationAtoms();
  resetSettingsAtoms();
  localStorage.clear();
  sessionStorage.clear();
});
