import { parse } from "anitomy";
import { FolderNode, Item, VideoFileEntry } from "@/types";

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

export function buildOutputPath(inputPath: string, suffix: string): string {
  const dot = inputPath.lastIndexOf(".");
  const ext = dot > 0 ? inputPath.slice(dot) : "";
  return dot > 0
    ? inputPath.slice(0, dot) + suffix + ext
    : inputPath + suffix;
}

const seasonPatterns = (season: string) => [
  new RegExp(`\\s+S${season.padStart(2, "0")}\\s*$`, "i"),
  new RegExp(`\\s+S${season}\\s*$`, "i"),
  new RegExp(`\\s+Season\\s+${season}\\s*$`, "i"),
  new RegExp(`\\s+${season}(?:st|nd|rd|th)\\s+Season\\s*$`, "i"),
];

function cleanTitle(title: string | undefined, season: string | undefined): string {
  if (!title) return "";
  let cleaned = title.trim();
  if (season) {
    for (const pattern of seasonPatterns(season)) {
      cleaned = cleaned.replace(pattern, "");
    }
  }
  return cleaned.trim() || title.trim();
}

export function formatParsedTitle(filename: string): string {
  const parsed = parse(filename);
  if (!parsed) return filename;

  const title = cleanTitle(parsed.title, parsed.season);
  const season = parsed.season ? `Season ${parsed.season}` : "";

  const epNum = parsed.episode?.number ?? parsed.episode?.numberAlt;
  const epTitle = parsed.episode?.title;
  const epNumAlt = parsed.episode?.numberAlt;

  let episodeStr = "";
  if (epNum !== undefined && epNum !== null) {
    const showRange = epNumAlt !== undefined && epNumAlt !== null && epNumAlt !== epNum;
    episodeStr = showRange ? `Episodes ${epNum}-${epNumAlt}` : `Episode ${epNum}`;
    if (epTitle) episodeStr += `: ${epTitle}`;
  } else if (epTitle) {
    episodeStr = `Episode: ${epTitle}`;
  }

  return [title, season, episodeStr].filter((part) => part && part.trim()).join(" • ");
}
