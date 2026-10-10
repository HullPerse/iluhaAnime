import { bench, group } from '@pmndrs/labs';

import { buildTree, flattenTree } from '../../src/lib/player/tree.utils';
import type { VideoFileEntry } from '../../src/types/fs';

function makeEntries(count: number, sep: '/' | '\\'): VideoFileEntry[] {
  const entries: VideoFileEntry[] = [];
  const seasons = 20;
  const perSeason = Math.ceil(count / seasons);
  let made = 0;
  for (let s = 1; s <= seasons && made < count; s++) {
    for (let e = 1; e <= perSeason && made < count; e++) {
      const name = `[Group] Show Title S${s}E${e} [1080p].mkv`;
      const parts = ['D:', 'Anime', 'Show', `Season ${s}`, name];
      entries.push({
        path: sep === '/' ? `D:/Anime/Show/Season ${s}/${name}` : parts.join('\\'),
        name,
        size: 1_400_000_000,
      });
      made++;
    }
  }
  return entries;
}

// Legacy buildTree logic kept for regression comparison: normalizes the whole
// path per entry and strips a leading slash with a regex.
function buildTreeLegacy(entries: VideoFileEntry[], rootPath: string) {
  const normalizedRoot = rootPath.replaceAll('\\', '/').replace(/\/$/, '');
  const prefix = `${normalizedRoot}/`;
  const root = {
    children: [] as never[],
    files: [] as VideoFileEntry[],
    name: normalizedRoot.split('/').filter(Boolean).pop() || rootPath,
    path: normalizedRoot,
  };
  const byPath = new Map<string, typeof root>();
  byPath.set(normalizedRoot, root);
  for (const entry of entries) {
    const entryPath = entry.path.split('\\').join('/');
    const relative = (
      entryPath.startsWith(prefix) ? entryPath.slice(prefix.length) : entryPath
    ).replace(/^\//, '');
    const parts = relative.split('/');
    let current = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const childPath = `${current.path}/${parts[i]}`;
      let child = byPath.get(childPath);
      if (!child) {
        child = { children: [], files: [], name: parts[i], path: childPath } as never;
        byPath.set(childPath, child);
        (current.children as unknown[]).push(child);
      }
      current = child;
    }
    current.files.push(entry);
  }
  return root;
}

const SLASH_5K = makeEntries(5000, '/');
const BACK_5K = makeEntries(5000, '\\');
const LEGACY_CHECK = buildTreeLegacy(BACK_5K, 'D:\\Anime');
const CURRENT_CHECK = buildTree(BACK_5K, 'D:\\Anime');
if (
  LEGACY_CHECK.children.length !== CURRENT_CHECK.children.length ||
  LEGACY_CHECK.files.length !== CURRENT_CHECK.files.length
) {
  throw new Error('buildTree parity check failed on backslash paths');
}
const BIG_TREE = buildTree(SLASH_5K, 'D:/Anime');
const BIG_OPEN = new Set<string>(['D:/Anime']);
{
  const stack = [BIG_TREE];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) break;
    BIG_OPEN.add(node.path);
    for (const child of node.children) stack.push(child);
  }
}

const NAMES_5K = SLASH_5K.map((entry) => entry.name);
const TRACK_EXTS = new Set(['ass', 'srt', 'vtt']);

function extLegacy(name: string): string | undefined {
  return name.split('.').pop()?.toLowerCase();
}

function extCurrent(name: string): string {
  const dot = name.lastIndexOf('.');
  return (dot === -1 ? name : name.slice(dot + 1)).toLowerCase();
}

group('player-scan @player-scan @quick', () => {
  bench('buildTree 5k slash paths (legacy)', () => {
    return buildTreeLegacy(SLASH_5K, 'D:/Anime').files.length;
  });

  bench('buildTree 5k slash paths (current)', () => {
    return buildTree(SLASH_5K, 'D:/Anime').files.length;
  });

  bench('buildTree 5k backslash paths (legacy)', () => {
    return buildTreeLegacy(BACK_5K, 'D:\\Anime').files.length;
  });

  bench('buildTree 5k backslash paths (current)', () => {
    return buildTree(BACK_5K, 'D:\\Anime').files.length;
  });

  bench('ext split-pop-lower 5k (legacy)', () => {
    let hits = 0;
    for (const name of NAMES_5K) {
      const ext = extLegacy(name);
      if (ext && TRACK_EXTS.has(ext)) hits++;
    }
    return hits;
  });

  bench('ext lastIndexOf-slice-lower 5k (current)', () => {
    let hits = 0;
    for (const name of NAMES_5K) {
      const ext = extCurrent(name);
      if (ext && TRACK_EXTS.has(ext)) hits++;
    }
    return hits;
  });

  bench('flattenTree full expand 5k (worker verdict baseline)', () => {
    return flattenTree(BIG_TREE, BIG_OPEN, '', undefined, 0, undefined).length;
  });

  bench('structuredClone 5k entries (worker copy price)', () => {
    return structuredClone(SLASH_5K).length;
  });
});
