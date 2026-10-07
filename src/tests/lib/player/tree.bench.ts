import { test } from 'vitest';

import { diffFolderSnapshot } from '@/lib/player/folder.utils';
import { fingerprint } from '@/lib/player/scan.utils';
import {
  buildTree,
  filterTreeByPaths,
  findFolderContainingFile,
  flattenTree,
  folderFilePaths,
  summarizeTree,
} from '@/lib/player/tree.utils';
import { filterTreeByHiddenPaths } from '@/lib/player/visibility.utils';
import type { VideoFileEntry } from '@/types/fs';
import type { FolderNode } from '@/types/torrent';

function makeEntries(seasons: number, epsPerSeason: number, movies: number): VideoFileEntry[] {
  const entries: VideoFileEntry[] = [];
  for (let s = 1; s <= seasons; s++) {
    for (let e = 1; e <= epsPerSeason; e++) {
      const name = `[Group] Show Title S${s}E${e} [1080p].mkv`;
      entries.push({
        path: `D:/Anime/Show/Season ${s}/${name}`,
        name,
        size: 1_400_000_000,
      });
    }
  }
  for (let m = 1; m <= movies; m++) {
    const name = `Movie ${m} (2020) [1080p].mkv`;
    entries.push({ path: `D:/Anime/Movies/${name}`, name, size: 8_000_000_000 });
  }
  return entries;
}

function collectFolderPaths(node: FolderNode, out: string[] = []): string[] {
  out.push(node.path);
  for (const child of node.children) collectFolderPaths(child, out);
  return out;
}

function collectFilePaths(node: FolderNode, out: string[] = []): string[] {
  for (const file of node.files) out.push(file.path);
  for (const child of node.children) collectFilePaths(child, out);
  return out;
}

function findBigLeaf(node: FolderNode): FolderNode {
  if (node.files.length >= 200) return node;
  for (const child of node.children) {
    const found = findBigLeaf(child);
    if (found.files.length > 0) return found;
  }
  return node;
}

const SMALL = makeEntries(4, 24, 20);
const BIG = makeEntries(20, 240, 200);

test('folder tree - buildTree (per scan)', async ({ bench }) => {
  const b1 = bench('buildTree 116 files', () => {
    const tree = buildTree(SMALL, 'D:/Anime');
    return summarizeTree(tree).count;
  });

  const b2 = bench('buildTree 5000 files', () => {
    const tree = buildTree(BIG, 'D:/Anime');
    return summarizeTree(tree).count;
  });

  await bench.compare(b1, b2, { time: 100, iterations: 3 });
});

test('folder tree - flattenTree (per render / keystroke)', async ({ bench }) => {
  const tree = buildTree(BIG, 'D:/Anime');
  const allOpen = new Set(collectFolderPaths(tree));
  const rootOnly = new Set([tree.path]);

  const b1 = bench('flattenTree full expand 5000 files', () => {
    return flattenTree(tree, allOpen, '', undefined, 0, undefined).length;
  });

  const b2 = bench('flattenTree collapsed root', () => {
    return flattenTree(tree, rootOnly, '', undefined, 0, undefined).length;
  });

  const b3 = bench('flattenTree search query full expand', () => {
    return flattenTree(tree, allOpen, 'ep 12', undefined, 0, undefined).length;
  });

  await bench.compare(b1, b2, b3, { time: 100, iterations: 3 });
});

test('folder tree - queue/open lookups (per file open)', async ({ bench }) => {
  const tree = buildTree(BIG, 'D:/Anime');
  const files = collectFilePaths(tree);
  const deepFile = files.at(-1) ?? "";
  const bigLeaf = findBigLeaf(tree);
  const flatEntries: VideoFileEntry[] = Array.from({ length: 2000 }, (_, i) => ({
    path: `D:/Anime/Flat/Ep ${i}.mkv`,
    name: `Ep ${i}.mkv`,
    size: 1_400_000_000,
  }));
  const flatTree = buildTree(flatEntries, 'D:/Anime/Flat');

  const b1 = bench('folderFilePaths localeCompare sort 2000', () => {
    return folderFilePaths(flatTree).length;
  });

  const b2 = bench('findFolderContainingFile deep hit', () => {
    return findFolderContainingFile(tree, deepFile)?.files.length ?? -1;
  });

  const b3 = bench('findFolderContainingFile miss (full walk)', () => {
    return findFolderContainingFile(tree, 'D:/Anime/Nowhere/ghost.mkv') === null ? 1 : 0;
  });

  const b4 = bench('folderFilePaths flat 240 sort cached', () => {
    return folderFilePaths(bigLeaf).length;
  });

  await bench.compare(b1, b2, b3, b4, { time: 100, iterations: 3 });
});

test('folder tree - filters and snapshot (per scan / toggle)', async ({ bench }) => {
  const tree = buildTree(BIG, 'D:/Anime');
  const files = collectFilePaths(tree);
  const keepHalf = new Set(files.filter((_, i) => i % 2 === 0));
  const hidden = Array.from({ length: 20 }, (_, i) => `D:/Anime/Hidden${i}`);
  const snapshot = { 'D:/Anime': files };

  const b1 = bench('filterTreeByPaths keep half 5000', () => {
    return summarizeTree(filterTreeByPaths(tree, keepHalf) ?? tree).count;
  });

  const b2 = bench('filterTreeByHiddenPaths 20 rules', () => {
    return summarizeTree(filterTreeByHiddenPaths(tree, hidden) ?? tree).count;
  });

  const b3 = bench('diffFolderSnapshot 5000 files', () => {
    return diffFolderSnapshot(snapshot, 'D:/Anime', files).fresh.length;
  });

  const b4 = bench('fingerprint 50 paths', () => {
    const paths = Array.from({ length: 50 }, (_, i) => `D:/Anime/Show${i}`);
    return fingerprint(paths, ['mkv', 'mp4', 'avi']).length;
  });

  const b5 = bench('filterTreeByHiddenPaths empty hidden x50k', () => {
    let checksum = 0;
    for (let i = 0; i < 50000; i++) {
      checksum += (filterTreeByHiddenPaths(tree, []) ?? tree).files.length;
    }
    return checksum;
  });

  await bench.compare(b1, b2, b3, b4, b5, { time: 100, iterations: 3 });
});
