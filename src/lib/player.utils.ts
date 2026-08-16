import { convertFileSrc } from "@tauri-apps/api/core";
import { parse } from "anitomy";

import type { TranslationKey } from "@/lib/i18n";
import type { FolderNode, Item, VideoFileEntry } from "@/types";
import type { TranslationVariables } from "@/types";
import type { VideoStreamInfo } from "@/types/player";

export function toAssetUrl(path: string): string {
  return convertFileSrc(path.replace(/\\/g, "/"));
}

export function collectFolderPaths(nodes: FolderNode[]): string[] {
  const paths: string[] = [];
  function walk(node: FolderNode) {
    for (const f of node.files) paths.push(f.path);
    for (const c of node.children) walk(c);
  }
  for (const n of nodes) walk(n);
  return paths;
}

export function parseTime(input: string): number | null {
  const parts = input.split(":").map((p) => p.trim());
  if (parts.length === 3) {
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const s = parseFloat(parts[2]);
    if (!isNaN(h) && !isNaN(m) && !isNaN(s)) return h * 3600 + m * 60 + s;
  }
  if (parts.length === 2) {
    const m = parseInt(parts[0], 10);
    const s = parseFloat(parts[1]);
    if (!isNaN(m) && !isNaN(s)) return m * 60 + s;
  }
  if (parts.length === 1) {
    const s = parseFloat(parts[0]);
    if (!isNaN(s)) return s;
  }
  return null;
}

export const formatStreams = (stream: VideoStreamInfo): string => {
  const parts: string[] = [];
  if (stream.language) parts.push(stream.language.toUpperCase());
  if (stream.is_forced) parts.push("[Forced]");
  if (stream.is_comment) parts.push("[Commentary]");

  const tech: string[] = [stream.codec_name.toUpperCase()];
  if (stream.channels) tech.push(`${stream.channels}ch`);
  if (stream.sample_rate)
    tech.push(`${(stream.sample_rate / 1000).toFixed(1)}kHz`);
  if (stream.bit_rate) tech.push(`${Math.round(stream.bit_rate / 1000)}kbps`);

  parts.push(tech.join(" "));
  if (stream.title) parts.push(stream.title);

  return parts.join(", ") || `Дорожка ${stream.index}`;
};

export const isAssSub = (s: VideoStreamInfo): boolean =>
  s.codec_name === "ass" ||
  s.codec_name === "ssa" ||
  (s.file_path ?? "").match(/\.(ass|ssa)$/i) !== null;

export function buildTree(
  entries: VideoFileEntry[],
  rootPath: string
): FolderNode {
  const root: FolderNode = {
    children: [],
    files: [],
    name: rootPath.split(/[/\\]/).filter(Boolean).pop() || rootPath,
    path: rootPath,
  };

  for (const entry of entries) {
    const relative = entry.path.replace(rootPath, "").replace(/^[/\\]/, "");
    const parts = relative.split(/[/\\]/);
    let current = root;

    for (let i = 0; i < parts.length - 1; i++) {
      let child = current.children.find((c) => c.name === parts[i]);
      if (!child) {
        child = {
          children: [],
          files: [],
          name: parts[i],
          path: `${current.path}/${parts[i]}`,
        };
        current.children.push(child);
      }
      current = child;
    }
    current.files.push(entry);
  }

  return root;
}

export function filterTreeByPaths(
  tree: FolderNode,
  matchingPaths: Set<string>
): FolderNode | null {
  const filteredFiles = tree.files.filter((f) => matchingPaths.has(f.path));
  const filteredChildren = tree.children
    .map((c) => filterTreeByPaths(c, matchingPaths))
    .filter((c): c is FolderNode => c !== null);

  if (filteredFiles.length === 0 && filteredChildren.length === 0) return null;

  return { ...tree, children: filteredChildren, files: filteredFiles };
}

function nodeMatchesSearch(node: FolderNode, query: string): boolean {
  const q = query.toLowerCase();
  if (node.name.toLowerCase().includes(q)) return true;
  for (const f of node.files) {
    if (f.name.toLowerCase().includes(q)) return true;
  }
  return node.children.some((c) => nodeMatchesSearch(c, q));
}

export function flattenTree(
  node: FolderNode,
  open: Set<string>,
  searchQuery: string,
  disabledExtensions: Set<string> | undefined,
  depth: number,
  trackExts?: Set<string>
): Item[] {
  if (!node.children.length && !node.files.length) return [];

  let filteredFiles = searchQuery
    ? node.files.filter((f) =>
        f.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : node.files;

  if (trackExts) {
    filteredFiles = filteredFiles.filter((f) => {
      const ext = f.name.split(".").pop()?.toLowerCase();
      return ext ? !trackExts.has(ext) : true;
    });
  }

  const hasFilteredChildren = searchQuery
    ? node.children.some((c) => nodeMatchesSearch(c, searchQuery))
    : node.children.length > 0;

  if (searchQuery && filteredFiles.length === 0 && !hasFilteredChildren)
    return [];

  const items: Item[] = [];
  const isOpen = open.has(node.path);

  if (depth > 0) {
    items.push({ depth, kind: "folder", node });
  }

  if (isOpen || depth === 0) {
    for (const file of filteredFiles) {
      const ext = file.name.split(".").pop()?.toLowerCase();
      const disabled = disabledExtensions && ext && disabledExtensions.has(ext);
      if (!disabled) {
        items.push({ depth: depth + 1, file, kind: "file" });
      }
    }
    for (const child of node.children) {
      items.push(
        ...flattenTree(
          child,
          open,
          searchQuery,
          disabledExtensions,
          depth + 1,
          trackExts
        )
      );
    }
  }

  if (
    depth > 0 &&
    items.length === 1 &&
    items[0].kind === "folder" &&
    items[0].node.path === node.path
  ) {
    if (isOpen) return [];
    const hasContent =
      filteredFiles.length > 0 ||
      node.children.some(
        (c) =>
          flattenTree(
            c,
            open,
            searchQuery,
            disabledExtensions,
            depth + 1,
            trackExts
          ).length > 0
      );
    if (!hasContent) return [];
  }

  return items;
}

export function buildOutputPath(inputPath: string, suffix: string): string {
  const dot = inputPath.lastIndexOf(".");
  const ext = dot > 0 ? inputPath.slice(dot) : "";
  return dot > 0 ? inputPath.slice(0, dot) + suffix + ext : inputPath + suffix;
}

const seasonPatterns = (season: string) => [
  new RegExp(`\\s+S${season.padStart(2, "0")}\\s*$`, "i"),
  new RegExp(`\\s+S${season}\\s*$`, "i"),
  new RegExp(`\\s+Season\\s+${season}\\s*$`, "i"),
  new RegExp(`\\s+${season}(?:st|nd|rd|th)\\s+Season\\s*$`, "i"),
];

function cleanTitle(
  title: string | undefined,
  season: string | undefined
): string {
  if (!title) return "";
  let cleaned = title.trim();
  if (season) {
    for (const pattern of seasonPatterns(season)) {
      cleaned = cleaned.replace(pattern, "");
    }
  }
  return cleaned.trim() || title.trim();
}

export function formatParsedTitle(
  filename: string,
  t: (key: TranslationKey, variables?: TranslationVariables) => string
): string {
  const parsed = parse(filename);
  if (!parsed) return filename;

  const title = cleanTitle(parsed.title, parsed.season);
  const season = parsed.season
    ? t("player.title.season", { n: parsed.season })
    : "";

  const epNum = parsed.episode?.number ?? parsed.episode?.numberAlt;
  const epTitle = parsed.episode?.title;
  const epNumAlt = parsed.episode?.numberAlt;

  let episodeStr = "";
  if (epNum !== undefined && epNum !== null) {
    const showRange =
      epNumAlt !== undefined && epNumAlt !== null && epNumAlt !== epNum;
    episodeStr = showRange
      ? t("player.title.episodesRange", { from: epNum, to: epNumAlt })
      : t("player.title.episode", { n: epNum });
    if (epTitle) episodeStr += `: ${epTitle}`;
  } else if (epTitle) {
    episodeStr = t("player.title.episodeColon", { title: epTitle });
  }

  return [title, season, episodeStr]
    .filter((part) => part && part.trim())
    .join(", ");
}

export function fileNameFromPath(p: string): string {
  const parts = p.replaceAll(/\\/g, "/").split("/");
  return parts.at(-1) || p;
}

export function formatETA(
  secs: number,
  t: (key: TranslationKey, variables?: TranslationVariables) => string
): string {
  if (!Number.isFinite(secs)) return "";
  if (secs <= 0) return t("player.eta.lessThanMinute");
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  if (m > 0) return t("player.eta.minutesSeconds", { m, s });
  return t("player.eta.seconds", { s });
}
