import { vi } from "vitest";

/**
 * Shared Tauri mock spies.
 *
 * With per-file isolation every test file gets a fresh module registry, so a
 * local `vi.fn()` inside `vi.mock()` is enough. With `isolate: false` the
 * registry is shared per worker: whichever file first evaluates a module
 * that statically imports `@tauri-apps/api/core` (directly or through
 * `invoke.utils.ts` / `transport.api.ts`) freezes that file's mock factory
 * into the module binding for the whole worker, and every other file's
 * assertions on its own local spy see zero calls.
 *
 * Every `vi.mock()` factory for the modules below MUST delegate to these
 * singletons instead of closing over a file-local `vi.fn()`. No matter which
 * factory wins the worker, all calls land on the same spy, and each file
 * configures it in its own `beforeEach` exactly like a fresh mock.
 * A global `beforeEach` in `src/tests/setup.ts` calls `mockReset()` on all
 * of them before every test, which reproduces fresh-mock semantics
 * (cleared history AND cleared implementations).
 */
export const mockInvoke = vi.fn();
export const mockConvertFileSrc = vi.fn();
mockConvertFileSrc.mockImplementation(
  (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`
);
export const mockListen = vi.fn();
export const mockEmit = vi.fn();
export const mockDialogOpen = vi.fn();
export const mockDialogSave = vi.fn();
export const mockDialogConfirm = vi.fn();
export const mockOpenPath = vi.fn();
export const mockOpenUrl = vi.fn();
export const mockWriteText = vi.fn();
export const mockReadText = vi.fn();
export const mockWriteImage = vi.fn();

export function resetAllSharedMocks(): void {
  for (const spy of [
    mockInvoke,
    mockConvertFileSrc,
    mockListen,
    mockEmit,
    mockDialogOpen,
    mockDialogSave,
    mockDialogConfirm,
    mockOpenPath,
    mockOpenUrl,
    mockWriteText,
    mockReadText,
    mockWriteImage,
  ]) {
    spy.mockReset();
  }
  mockConvertFileSrc.mockImplementation(
    (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`
  );
}
