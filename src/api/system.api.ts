import type { HostStats } from "@/types/ipc";
import type { NotificationTarget } from "@/types/notification";
import type {
  CropRect,
  SavedScreenshot,
  ScreenshotCapture,
  ScreenshotFormat,
  ScreenshotLayersPayload,
} from "@/types/screenshot";
import type { SettingsStore } from "@/types/settings";
import type { DitherImageMeta, UserImageFile } from "@/types/userimage";

import type { ApiTransport } from "./transport.api";
import { tauriTransport } from "./transport.api";

export interface SystemApiConfig {
  transport?: ApiTransport;
}

export interface SaveScreenshotInput {
  sourcePath: string;
  dir: string;
  name: string;
  format: ScreenshotFormat;
  crop: CropRect | null;
  layers?: ScreenshotLayersPayload;
}

export class SystemApi {
  private readonly transport: ApiTransport;

  constructor(config: SystemApiConfig = {}) {
    this.transport = config.transport ?? tauriTransport;
  }

  private call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    return this.transport.call<T>(command, args);
  }

  getUserImage(id: string): Promise<UserImageFile> {
    return this.call("get_user_image", { id });
  }

  listUserImages(): Promise<UserImageFile[]> {
    return this.call("list_user_images");
  }

  importUserImage(path: string): Promise<UserImageFile> {
    return this.call("import_user_image", { path });
  }

  deleteUserImage(id: string): Promise<void> {
    return this.call("delete_user_image", { id });
  }

  listDitherImageMeta(): Promise<DitherImageMeta[]> {
    return this.call("list_dither_image_meta");
  }

  importDitherImage(path: string): Promise<UserImageFile> {
    return this.call("import_dither_image", { path });
  }

  deleteDitherImage(id: string): Promise<void> {
    return this.call("delete_dither_image", { id });
  }

  getDitherImage(id: string): Promise<UserImageFile> {
    return this.call("get_dither_image", { id });
  }

  getDitherImages(ids: string[]): Promise<UserImageFile[]> {
    return this.call("get_dither_images", { ids });
  }

  updateDitherImageData(id: string, dataUrl: string): Promise<UserImageFile> {
    return this.call("update_dither_image_data", { id, dataUrl });
  }

  captureScreenshot(): Promise<ScreenshotCapture> {
    return this.call("capture_screenshot");
  }

  saveScreenshot(input: SaveScreenshotInput): Promise<SavedScreenshot> {
    return this.call("save_screenshot", { ...input });
  }

  copyScreenshot(
    sourcePath: string,
    crop: CropRect | null,
    layers?: ScreenshotLayersPayload
  ): Promise<string> {
    return this.call("copy_screenshot", { sourcePath, crop, layers });
  }

  discardScreenshot(sourcePath: string): Promise<void> {
    return this.call("discard_screenshot", { sourcePath });
  }

  showToast(title: string, body: string | null, target: NotificationTarget | null): Promise<void> {
    return this.call("show_toast", { action: target, body, title });
  }

  takePendingDeepLinks(): Promise<string[]> {
    return this.call("take_pending_deep_links");
  }

  setNotificationSettings(enabled: boolean, onComplete: boolean, onError: boolean): Promise<void> {
    return this.call("set_notification_settings", {
      config: { enabled, on_complete: onComplete, on_error: onError },
    });
  }

  setWindowChrome(
    decorations: boolean,
    effect: SettingsStore["windowEffect"],
    roundedCorners: boolean
  ): Promise<void> {
    return this.call("set_window_chrome", { decorations, effect, roundedCorners });
  }

  checkFfprobe(): Promise<boolean> {
    return this.call("check_ffprobe");
  }

  getHostStats(): Promise<HostStats> {
    return this.call("get_host_stats");
  }

  listSystemFonts(): Promise<string[]> {
    return this.call("list_system_fonts");
  }

  getRemoteImagesStats(): Promise<{ bytes: number; count: number }> {
    return this.call("get_remote_images_stats");
  }

  clearRemoteImageCache(): Promise<number> {
    return this.call("clear_remote_image_cache");
  }

  readFileBytes(path: string): Promise<number[]> {
    return this.call("read_file_bytes", { path });
  }

  getAppCache<T>(namespace: string, key: string): Promise<T | null> {
    return this.call("get_app_cache", { key, namespace });
  }

  putAppCache(
    namespace: string,
    key: string,
    payload: string,
    ttlSeconds: number | null
  ): Promise<void> {
    return this.call("put_app_cache", { key, namespace, payload, ttlSeconds });
  }

  deleteAppCache(namespace: string, key: string): Promise<void> {
    return this.call("delete_app_cache", { key, namespace });
  }
}

export const systemApi = new SystemApi();
