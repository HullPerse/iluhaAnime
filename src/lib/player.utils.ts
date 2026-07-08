import { FolderNode, VideoFileEntry, VideoStreamInfo } from "@/types";

export function nodeMatchesSearch(node: FolderNode, query: string): boolean {
  const value = query.toLowerCase();
  if (node.name.toLowerCase().includes(value)) return true;
  if (node.files.some((f) => f.name.toLowerCase().includes(value))) return true;
  return node.children.some((children) => nodeMatchesSearch(children, value));
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

function sortNode(n: FolderNode): FolderNode {
  n.children.sort((a, b) => a.name.localeCompare(b.name));
  n.files.sort((a, b) => a.name.localeCompare(b.name));
  for (const c of n.children) sortNode(c);

  return n;
}

export function buildTree(
  entries: VideoFileEntry[],
  rootPath: string,
): FolderNode {
  const root: FolderNode = {
    name: rootPath.split(/[/\\]/).pop() ?? "Folder",
    path: rootPath,
    files: [],
    children: [],
  };

  for (const folder of entries) {
    const path = folder.path
      .replace(folder.name, "")
      .replace(rootPath, "")
      .replace(/^[/\\]+/, "")
      .replace(/[/\\]$/, "");

    const parts = () => {
      if (!path) return [];
      else return path.split(/[/\\]/);
    };

    let node = root;
    let accumulatedPath = rootPath;

    for (const part of parts()) {
      accumulatedPath = `${accumulatedPath}/${part}`;
      let children = node.children.find((children) => children.name === part);

      if (!children) {
        children = { name: part, path: accumulatedPath, files: [], children: [] };
        node.children.push(children);
      }

      node = children;
    }

    node.files.push(folder);
  }

  return sortNode(root);
}


export function parseTime(input: string): number | null {
  const parts = input.split(":").map((p) => p.trim())
  if (parts.length === 3) {
    const h = parseInt(parts[0])
    const m = parseInt(parts[1])
    const s = parseFloat(parts[2])
    if (!isNaN(h) && !isNaN(m) && !isNaN(s)) return h * 3600 + m * 60 + s
  }
  if (parts.length === 2) {
    const m = parseInt(parts[0])
    const s = parseFloat(parts[1])
    if (!isNaN(m) && !isNaN(s)) return m * 60 + s
  }
  if (parts.length === 1) {
    const s = parseFloat(parts[0])
    if (!isNaN(s)) return s
  }
  return null
}


export const formatStreams = (stream: VideoStreamInfo) => {
  const parts: string[] = [];
  if (stream.language) parts.push(stream.language.toUpperCase());
  if (stream.is_forced) parts.push("[Forced]");
  if (stream.is_comment) parts.push("[Commentary]");

  const tech: string[] = [stream.codec_name.toUpperCase()];
  if (stream.channels) tech.push(`${stream.channels}ch`);
  if (stream.sample_rate) tech.push(`${(stream.sample_rate / 1000).toFixed(1)}kHz`);
  if (stream.bit_rate) tech.push(`${Math.round(stream.bit_rate / 1000)}kbps`);

  parts.push(tech.join(" "));
  if (stream.title) parts.push(stream.title);

  return parts.join(" — ") || `Дорожка ${stream.index}`;
};

export const isAssSub = (s: VideoStreamInfo) =>
  s.codec_name === "ass" ||
  s.codec_name === "ssa" ||
  (s.file_path ?? "").match(/\.(ass|ssa)$/i);
