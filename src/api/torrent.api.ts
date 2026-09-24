import { useSettingsStore } from "@/store/settings.store";
import type { Source } from "@/types/search";
import type { SessionConfigPayload } from "@/types/settings";
import type {
  Anime,
  CreatedTorrent,
  FilePriority,
  TorrentCheckResult,
  TorrentDetails,
  TorrentDiagnostics,
  TorrentFileInfo,
  TorrentInfo,
  TorrentLimits,
  TorrentResumeResult,
} from "@/types/torrent";

import type { ApiTransport } from "./transport.api";
import { tauriTransport } from "./transport.api";

export interface TorrentApiConfig {
  transport?: ApiTransport;
  proxies?: Record<string, string>;
}

export interface TorrentSearchArgs {
  query: string;
  page?: number;
  sort?: string;
  order?: string;
}

export interface StartTorrentDownloadInput {
  magnet?: string;
  fileBytes?: number[];
  saveDir: string;
  onlyFiles: number[] | null;
  subFolder: string | null;
  sequential: boolean;
}

export interface TorrentInfoResult {
  id: number;
  name: string;
  files: TorrentFileInfo[];
  conflicting_files: string[];
  has_common_folder: boolean;
}

export interface ScannedExtraFile {
  path: string;
  name: string;
  size: number;
}

export class TorrentApi {
  private readonly transport: ApiTransport;
  private readonly proxies: Record<string, string> | null;

  constructor(config: TorrentApiConfig = {}) {
    this.transport = config.transport ?? tauriTransport;
    this.proxies = config.proxies ?? null;
  }

  proxyFor(source: string): string | undefined {
    const proxies = this.proxies ?? useSettingsStore.getState().searchProxyUrls;
    return proxies[source] || undefined;
  }

  private proxyArgs(source?: string): Record<string, string | undefined> {
    const proxy = source ? this.proxyFor(source) : undefined;
    return { proxyUrl: proxy, proxy_url: proxy };
  }

  private call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    return this.transport.call<T>(command, args);
  }

  searchBySource(source: Source, args: TorrentSearchArgs): Promise<Anime[]> {
    const proxy = this.proxyFor(source);
    const base = { query: args.query, proxyUrl: proxy, proxy_url: proxy };
    const paged = { ...base, page: args.page, sort: args.sort, order: args.order };
    if (source === "rutracker") return this.call("search_rutracker", base);
    if (source === "nyaa") return this.call("search_nyaa", paged);
    if (source === "sukebei") return this.call("search_sukebei", paged);
    if (source === "nekobt") return this.call("search_nekobt", { ...base, page: args.page });
    return this.call("search_erairaws", base);
  }

  testSourceConnection(source: string, proxy: string): Promise<string> {
    return this.call("test_source_connection", {
      source,
      proxyUrl: proxy || null,
      proxy_url: proxy || null,
    });
  }

  checkRutrackerSession(): Promise<boolean> {
    return this.call("check_rutracker_session", { ...this.proxyArgs("rutracker") });
  }

  checkNekobtSession(): Promise<boolean> {
    return this.call("check_nekobt_session", { ...this.proxyArgs("nekobt") });
  }

  checkEraiSession(): Promise<boolean> {
    return this.call("check_erai_session", { ...this.proxyArgs("erai-raws") });
  }

  rutrackerLogin(username: string, password: string): Promise<string> {
    return this.call("rutracker_login", {
      username: username.trim(),
      password,
      ...this.proxyArgs("rutracker"),
    });
  }

  rutrackerSetCookies(cookies: string): Promise<string> {
    return this.call("rutracker_set_cookies", {
      cookies: cookies.trim(),
      ...this.proxyArgs("rutracker"),
    });
  }

  rutrackerLogout(): Promise<void> {
    return this.call("rutracker_logout");
  }

  rutrackerWebviewLogin(): Promise<string> {
    return this.call("rutracker_webview_login", { ...this.proxyArgs("rutracker") });
  }

  rutrackerFinishWebviewLogin(): Promise<string> {
    return this.call("rutracker_finish_webview_login");
  }

  eraiWebviewLogin(): Promise<string> {
    return this.call("erai_webview_login");
  }

  eraiFinishWebviewLogin(): Promise<string> {
    return this.call("erai_finish_webview_login");
  }

  eraiLogout(): Promise<void> {
    return this.call("erai_logout");
  }

  eraiOpenPage(pageUrl: string): Promise<string> {
    return this.call("erai_open_page", { pageUrl });
  }

  nekobtSetApiKey(apiKey: string): Promise<string> {
    return this.call("nekobt_set_api_key", {
      apiKey: apiKey.trim(),
      ...this.proxyArgs("nekobt"),
    });
  }

  nekobtLogout(): Promise<void> {
    return this.call("nekobt_logout");
  }

  rutrackerGetMagnet(topicId: string): Promise<string> {
    return this.call("rutracker_get_magnet", { topicId, ...this.proxyArgs("rutracker") });
  }

  rutrackerGetTorrentBytes(topicId: string): Promise<number[]> {
    return this.call("rutracker_get_torrent_bytes", { topicId, ...this.proxyArgs("rutracker") });
  }

  fetchTorrentBytes(url: string, source?: string): Promise<number[]> {
    const proxy = source ? this.proxyFor(source) : undefined;
    return this.call("fetch_torrent_bytes", { url, proxyUrl: proxy, proxy_url: proxy });
  }

  getTorrentDetails(source: string, url: string, proxyUrl?: string): Promise<TorrentDetails> {
    const proxy = proxyUrl ?? this.proxyFor(source);
    return this.call("get_torrent_details", { source, url, proxyUrl: proxy, proxy_url: proxy });
  }

  listTorrents(): Promise<TorrentInfo[]> {
    return this.call("list_torrents");
  }

  listenPort(): Promise<number | null> {
    return this.call("torrent_listen_port");
  }

  runningTorrentFiles(id: number): Promise<TorrentFileInfo[]> {
    return this.call("get_running_torrent_files", { id });
  }

  pauseTorrent(id: number, infoHash?: string): Promise<void> {
    return this.call("pause_torrent", { id, infoHash });
  }

  resumeTorrent(id: number, infoHash?: string): Promise<TorrentResumeResult> {
    return this.call("resume_torrent", { id, infoHash });
  }

  removeTorrent(id: number, deleteFiles: boolean, infoHash?: string): Promise<void> {
    return this.call("remove_torrent", { id, deleteFiles, infoHash });
  }

  updateOnlyFiles(id: number, onlyFiles: number[], infoHash?: string): Promise<void> {
    return this.call("update_torrent_only_files", { id, onlyFiles, infoHash });
  }

  setFilePriority(
    id: number,
    fileIndices: number[],
    priority: FilePriority,
    infoHash?: string
  ): Promise<void> {
    return this.call("set_file_priority", { id, fileIndices, priority, infoHash });
  }

  setSequentialDownload(id: number, enabled: boolean, infoHash?: string): Promise<void> {
    return this.call("set_sequential_download", { id, enabled, infoHash });
  }

  setTorrentDownloadOrder(id: number, fileIndices: number[], infoHash?: string): Promise<void> {
    return this.call("set_torrent_download_order", { id, fileIndices, infoHash });
  }

  redownloadFile(id: number, fileIndex: number, infoHash: string): Promise<number> {
    return this.call("redownload_file", { id, fileIndex, infoHash });
  }

  recheckTorrent(id: number, infoHash?: string): Promise<TorrentCheckResult> {
    return this.call("recheck_torrent", { id, infoHash });
  }

  recheckPausedTorrent(id: number, infoHash?: string): Promise<TorrentResumeResult> {
    return this.call("recheck_paused_torrent", { id, infoHash });
  }

  addTorrentTracker(id: number, tracker: string, infoHash: string): Promise<void> {
    return this.call("add_torrent_tracker", { id, tracker, infoHash });
  }

  removeTorrentTracker(id: number, tracker: string, infoHash: string): Promise<void> {
    return this.call("remove_torrent_tracker", { id, tracker, infoHash });
  }

  getTorrentDiagnostics(id: number, infoHash?: string): Promise<TorrentDiagnostics> {
    return this.call("get_torrent_diagnostics", { id, info_hash: infoHash });
  }

  getTorrentLimits(id: number): Promise<TorrentLimits> {
    return this.call("get_torrent_limits", { id });
  }

  setTorrentLimits(
    id: number,
    limits: { downloadBps: number | null; uploadBps: number | null },
    infoHash?: string
  ): Promise<void> {
    return this.call("set_torrent_limits", {
      id,
      limits,
      infoHash,
    });
  }

  setGlobalSpeedLimits(downloadBps: number | null, uploadBps: number | null): Promise<void> {
    return this.call("set_global_speed_limits", { downloadBps, uploadBps });
  }

  getTorrentInfo(magnet: string, saveDir: string): Promise<TorrentInfoResult> {
    return this.call("get_torrent_info", { magnet, saveDir });
  }

  getTorrentInfoFromFile(fileBytes: number[], saveDir: string): Promise<TorrentInfoResult> {
    return this.call("get_torrent_info_from_file", { fileBytes, saveDir });
  }

  startTorrentDownload(input: StartTorrentDownloadInput): Promise<number> {
    return this.call(input.magnet ? "start_torrent_download" : "start_torrent_download_from_file", {
      ...input,
    });
  }

  saveSessionConfig(config: SessionConfigPayload): Promise<void> {
    return this.call("save_session_config", { config });
  }

  createTorrentFromFolder(sourceDir: string): Promise<CreatedTorrent> {
    return this.call("create_torrent_from_folder", { sourceDir });
  }

  saveCreatedTorrent(from: string, to: string): Promise<void> {
    return this.call("save_created_torrent", { from, to });
  }

  scanExtraFiles(path: string): Promise<ScannedExtraFile[]> {
    return this.call("scan_extra_files", { path });
  }
}

export const torrentApi = new TorrentApi();
