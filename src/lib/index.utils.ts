import { FolderNode, Item, LanguageTag, VideoFileEntry } from "@/types";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { Update, check } from "@tauri-apps/plugin-updater";
import { type TorrentTreeNode } from "./torrent.utils";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function detectLanguages(title: string): LanguageTag[] {
  const tags: LanguageTag[] = [];
  const upper = title.toUpperCase();

  if (/\bRUS\b/.test(upper) || /\bRU\b/.test(upper) || /\[Рус\]/.test(title))
    tags.push({ code: "ru", label: "RU" });

  if (/\bENG\b/.test(upper) || /\bEN\b/.test(upper))
    tags.push({ code: "en", label: "EN" });

  if (/\bMULTISUB\b/.test(upper) || /\bMULTIPLE SUBTITLE\b/.test(upper))
    tags.push({ code: "multi", label: "Multi" });

  if (/\bDUAL[- ]?AUDIO\b/.test(upper))
    tags.push({ code: "dual", label: "Dual" });

  const langMap: Record<string, string> = {
    "POR-BR": "PT",
    POR: "PT",
    "SPA-LA": "ES",
    SPA: "ES",
    FRE: "FR",
    FR: "FR",
    GER: "DE",
    DE: "DE",
    ITA: "IT",
    JPN: "JP",
    JP: "JP",
    CHI: "ZH",
    KOR: "KO",
    ARA: "AR",
    THA: "TH",
    VIE: "VI",
  };

  for (const [key, label] of Object.entries(langMap)) {
    if (tags.some((t) => t.label === label)) continue;
    if (upper.includes(key)) tags.push({ code: key, label });
  }

  return tags;
}

export function formatSize(size: string): string {
  const match = size.match(/^([\d.]+)\s*(.*)$/);
  if (!match) return size;
  const num = Number(match[1]);
  const unit = match[2];
  return `${num.toFixed(2)} ${unit}`.trim();
}

export const parseSize = (s: string): number => {
  const match = s.match(/^([\d.]+)\s*(B|KB|KiB|MB|MiB|GB|GiB)?$/);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const unit = match[2] || "B";
  const multipliers: Record<string, number> = {
    B: 1,
    KB: 1024,
    KiB: 1024,
    MB: 1048576,
    MiB: 1048576,
    GB: 1073741824,
    GiB: 1073741824,
  };
  return num * (multipliers[unit] || 1);
};

export const qualityMatch = (title: string, quality: string): boolean => {
  const num = quality.replace("p", "").replace("P", "");
  return new RegExp(`\\b${num}p\\b`, "i").test(title);
};

export async function installUpdate(update: Update) {
  if (!update) return;
  try {
    await update.downloadAndInstall();
  } catch (e) {
    console.error("Failed to install update:", e);
  }
}

export async function checkForUpdates(): Promise<Update | null> {
  try {
    return await check();
  } catch (e) {
    console.debug("Auto-update check skipped:", e);
    return null;
  }
}

export function buildTree(
  entries: VideoFileEntry[],
  rootPath: string,
): FolderNode {
  const root: FolderNode = {
    path: rootPath,
    name: rootPath.split(/[/\\]/).filter(Boolean).pop() || rootPath,
    files: [],
    children: [],
  };

  for (const entry of entries) {
    const relative = entry.path.replace(rootPath, "").replace(/^[/\\]/, "");
    const parts = relative.split(/[/\\]/);
    let current = root;

    for (let i = 0; i < parts.length - 1; i++) {
      let child = current.children.find((c) => c.name === parts[i]);
      if (!child) {
        child = {
          path: `${current.path}/${parts[i]}`,
          name: parts[i],
          files: [],
          children: [],
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
  matchingPaths: Set<string>,
): FolderNode | null {
  const filteredFiles = tree.files.filter((f) => matchingPaths.has(f.path));
  const filteredChildren = tree.children
    .map((c) => filterTreeByPaths(c, matchingPaths))
    .filter((c): c is FolderNode => c !== null);

  if (filteredFiles.length === 0 && filteredChildren.length === 0) return null;

  return { ...tree, files: filteredFiles, children: filteredChildren };
}

function nodeMatchesSearch(node: FolderNode, query: string): boolean {
  const q = query.toLowerCase();
  if (node.name.toLowerCase().includes(q)) return true;
  for (const f of node.files) {
    if (f.name.toLowerCase().includes(q)) return true;
  }
  return node.children.some((c) => nodeMatchesSearch(c, q));
}

export function collectFileIndices(node: TorrentTreeNode): number[] {
  const indices = node.files.map((f) => f.index);
  for (const child of node.children) {
    indices.push(...collectFileIndices(child));
  }
  return indices;
}

export function flattenTree(
  node: FolderNode,
  open: Set<string>,
  searchQuery: string,
  disabledExtensions: Set<string> | undefined,
  depth: number,
  trackExts?: Set<string>,
): Item[] {
  if (!node.children.length && !node.files.length) return [];

  let filteredFiles = searchQuery
    ? node.files.filter((f) =>
        f.name.toLowerCase().includes(searchQuery.toLowerCase()),
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
    items.push({ kind: "folder", node, depth });
  }

  if (isOpen || depth === 0) {
    for (const file of filteredFiles) {
      const ext = file.name.split(".").pop()?.toLowerCase();
      const disabled = disabledExtensions && ext && disabledExtensions.has(ext);
      if (!disabled) {
        items.push({ kind: "file", file, depth: depth + 1 });
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
          trackExts,
        ),
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
            trackExts,
          ).length > 0,
      );
    if (!hasContent) return [];
  }

  return items;
}
