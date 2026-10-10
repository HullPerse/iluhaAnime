import { bench, group } from '@pmndrs/labs';

import { buildTorrentTree, flattenTorrentTree } from '../../src/lib/torrent/tree.utils';
import type { TorrentFileInfo } from '../../src/types/torrent';

function makeRelease(episodes: number, seed: string): TorrentFileInfo[] {
  const files: TorrentFileInfo[] = [];
  let index = 0;
  const push = (name: string, size: number) => {
    files.push({
      name,
      index: index++,
      completed: true,
      selected: true,
      priority: "normal",
      exists: true,
      size,
      progress_bytes: size,
    });
  };
  for (let ep = 1; ep <= episodes; ep++) {
    const n = String(ep).padStart(3, '0');
    push(
      `${seed}/[Leopard-Raws] Hunter x Hunter - ${n} (2011) [1080p][RUS(ext), JAP+Sub].mkv`,
      1_400_000_000
    );
    if (ep % 2 === 0) {
      push(`${seed}/Subtitles/${seed} - ${n}.ass`, 80_000);
    }
  }
  push(`${seed}/info.nfo`, 2000);
  return files;
}

const HXH_148 = makeRelease(148, 'Hunter x Hunter (2011)');
const BIG_6K = makeRelease(4000, 'Big Pack');

function openAll(nodes: ReturnType<typeof buildTorrentTree>['nodes']): Set<string> {
  const open = new Set<string>();
  const walk = (list: typeof nodes, depth: number): void => {
    for (const node of list) {
      open.add(node.name + depth);
      walk(node.children, depth + 1);
    }
  };
  walk(nodes, 0);
  return open;
}

const HXH_TREE = buildTorrentTree(HXH_148);
const HXH_OPEN = openAll(HXH_TREE.nodes);
const BIG_TREE = buildTorrentTree(BIG_6K);
const BIG_OPEN = openAll(BIG_TREE.nodes);

group('torrent-tree @torrent @quick', () => {
  bench('build 148 files (HxH release shape)', () => {
    const t = buildTorrentTree(HXH_148);
    return t.nodes.length + t.rootFiles.length;
  });

  bench('flatten 148 open-all', () => {
    return flattenTorrentTree(HXH_TREE.nodes, HXH_OPEN, undefined, HXH_TREE.rootFiles).length;
  });

  bench('build 6k files (scale probe)', () => {
    const t = buildTorrentTree(BIG_6K);
    return t.nodes.length + t.rootFiles.length;
  });

  bench('flatten 6k open-all (scale probe)', () => {
    return flattenTorrentTree(BIG_TREE.nodes, BIG_OPEN, undefined, BIG_TREE.rootFiles).length;
  });
});
