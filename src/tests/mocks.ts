import { vi } from "vitest";

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
export const mockSetAlwaysOnTop = vi.fn();
export const mockStartDragging = vi.fn();
export const mockUpdaterCheck = vi.fn();

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
    mockSetAlwaysOnTop,
    mockStartDragging,
    mockUpdaterCheck,
  ]) {
    spy.mockReset();
  }
  mockConvertFileSrc.mockImplementation(
    (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`
  );
}
