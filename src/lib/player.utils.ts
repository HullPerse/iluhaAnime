import { FolderNode, VideoFileEntry } from "@/types";

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

    for (const part of parts()) {
      let children = node.children.find((children) => children.name === part);

      if (!children) {
        children = { name: part, path: "", files: [], children: [] };
        node.children.push(children);
      }

      node = children;
    }

    node.files.push(folder);
  }

  return sortNode(root);
}
