import type { NetworkDiagnosis } from "@/types/api/network";
import type { HostStats } from "@/types/core/ipc";
import type { NotificationTarget } from "@/types/core/notification";
import type {
  CropRect,
  SavedScreenshot,
  ScreenshotCapture,
  ScreenshotLayersPayload,
  ScreenshotVideoRect,
} from "@/types/core/screenshot";
import type { SettingsStore } from "@/types/ui/settings";
import type { DitherImageMeta, UserImageFile } from "@/types/core/userimage";

import type { ApiTransport } from "@/types/core/transport";
import { tauriTransport } from "@/api/transport.api";
import type { SaveScreenshotInput, SystemApiConfig } from "@/types/core/system";
import { assertSchema } from "@/lib/core/system/invoke.utils";
import {
  DatabaseStatusSchema,
  HostStatsSchema,
  RemoteImageStatsSchema,
  VideoCacheStatsSchema,
} from "@/api/system.schema";

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

  captureScreenshot(videoRect?: ScreenshotVideoRect): Promise<ScreenshotCapture> {
    return this.call("capture_screenshot", { videoRect });
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

  setNotificationSettings(
    enabled: boolean,
    onComplete: boolean,
    onError: boolean,
    onHealth: boolean
  ): Promise<void> {
    return this.call("set_notification_settings", {
      config: { enabled, on_complete: onComplete, on_error: onError, on_health: onHealth },
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

  collectReproBundle(frontendJson: string, outPath: string): Promise<string> {
    return this.call("collect_repro_bundle", { frontendJson, outPath });
  }

  async getHostStats(): Promise<HostStats> {
    const stats = await this.call<HostStats>("get_host_stats");
    assertSchema(stats, HostStatsSchema);
    return stats;
  }

  listSystemFonts(): Promise<string[]> {
    return this.call("list_system_fonts");
  }

  async getRemoteImagesStats(): Promise<{ bytes: number; count: number }> {
    const stats = await this.call<{ bytes: number; count: number }>("get_remote_images_stats");
    assertSchema(stats, RemoteImageStatsSchema);
    return stats;
  }

  async getVideoCacheStats(): Promise<{ hits: number; misses: number }> {
    const stats = await this.call<{ hits: number; misses: number }>("get_video_cache_stats");
    assertSchema(stats, VideoCacheStatsSchema);
    return stats;
  }

  clearRemoteImageCache(): Promise<number> {
    return this.call("clear_remote_image_cache");
  }

  savePosterBytes(data: number[], path: string): Promise<string> {
    return this.call("save_poster_bytes", { data, path });
  }

  saveCachedImage(source: string, path: string): Promise<string> {
    return this.call("save_cached_image", { source, path });
  }

  downloadFfmpeg(source: string): Promise<string> {
    return this.call("download_ffmpeg", { source });
  }

  removeFfmpeg(): Promise<boolean> {
    return this.call("remove_ffmpeg");
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

  async getDatabaseStatus(): Promise<{
    ok: boolean;
    version: number | null;
    dataDir: string;
    error: string | null;
  }> {
    const status = await this.call<{
      ok: boolean;
      version: number | null;
      dataDir: string;
      error: string | null;
    }>("get_database_status");
    assertSchema(status, DatabaseStatusSchema);
    return status;
  }

  probeNetwork(anilistProxyUrl: string | null, animelibProxyUrl: string | null): Promise<boolean> {
    return this.call("network_probe", { anilistProxyUrl, animelibProxyUrl });
  }

  diagnoseNetwork(url: string, proxyUrl: string | null): Promise<NetworkDiagnosis> {
    return this.call("network_diagnose", { url, proxyUrl });
  }
}

export const systemApi = new SystemApi();
