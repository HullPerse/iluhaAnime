import { bench, group } from "@pmndrs/labs";

import { parseMediaPath, clearMediaParseCache } from "@hullperse/hp_utils/media/parse";
import { buildTorrentTree } from "../../src/lib/torrent/torrentTree.utils";
import fixtureRows from "../../src/tests/lib/media/fixtures.json";
import type { TorrentFileInfo } from "../../src/types/torrent/torrent";

interface Fixture {
  dir: string;
  file: string;
}

const BASE_PATHS = (fixtureRows as Fixture[]).map((f) => `${f.dir}/${f.file}`);

function scaledPaths(factor: number): string[] {
  const out: string[] = [];
  for (let copy = 0; copy < factor; copy++) {
    for (const path of BASE_PATHS) {
      out.push(copy === 0 ? path : `Library ${copy}/${path}`);
    }
  }
  return out;
}

const PATHS_1X = scaledPaths(1);
const PATHS_4X = scaledPaths(4);
const PATHS_16X = scaledPaths(16);

function makeRelease(episodes: number, seed: string): TorrentFileInfo[] {
  const files: TorrentFileInfo[] = [];
  let index = 0;
  const push = (name: string, size: number) => {
    files.push({
      completed: true,
      exists: true,
      index: index++,
      name,
      priority: "normal",
      progress_bytes: size,
      selected: true,
      size,
    });
  };
  for (let ep = 1; ep <= episodes; ep++) {
    const n = String(ep).padStart(3, "0");
    push(
      `${seed}/[Leopard-Raws] Hunter x Hunter - ${n} (2011) [1080p][RUS(ext), JAP+Sub].mkv`,
      1_400_000_000
    );
    if (ep % 2 === 0) push(`${seed}/Subtitles/${seed} - ${n}.ass`, 80_000);
  }
  push(`${seed}/info.nfo`, 2000);
  return files;
}

function parseChecksum(paths: string[]): number {
  let sum = 0;
  for (const path of paths) {
    const parsed = parseMediaPath(path);
    sum +=
      parsed.title.length +
      (parsed.episode.number ?? 0) +
      (parsed.season ?? 0) +
      (parsed.year ?? 0);
  }
  return sum;
}

function treeChecksum(nodes: ReturnType<typeof buildTorrentTree>["nodes"]): number {
  let count = 0;
  const walk = (list: typeof nodes): void => {
    for (const node of list) {
      count += 1;
      walk(node.children);
    }
  };
  walk(nodes);
  return count;
}

group("memory-scale @memory @quick", () => {
  bench("parse corpus 1x (125 files, cold)", function* parse1x() {
    const checksum = yield () => {
      clearMediaParseCache();
      return parseChecksum(PATHS_1X);
    };
    return checksum;
  });

  bench("parse corpus 4x (500 files, cold)", function* parse4x() {
    const checksum = yield () => {
      clearMediaParseCache();
      return parseChecksum(PATHS_4X);
    };
    return checksum;
  });

  bench("parse corpus 16x (2000 files, cold)", function* parse16x() {
    const checksum = yield () => {
      clearMediaParseCache();
      return parseChecksum(PATHS_16X);
    };
    return checksum;
  });

  bench("parse corpus 16x (2000 files, warm)", function* parse16xWarm() {
    parseChecksum(PATHS_16X);
    const checksum = yield () => parseChecksum(PATHS_16X);
    return checksum;
  });

  bench("torrent tree 148 files", function* treeSmall() {
    const files = makeRelease(148, "HxH");
    const checksum = yield () => treeChecksum(buildTorrentTree(files).nodes);
    return checksum;
  });

  bench("torrent tree 6k files", function* treeLarge() {
    const files = makeRelease(4000, "Big Pack");
    const checksum = yield () => treeChecksum(buildTorrentTree(files).nodes);
    return checksum;
  });

  bench("torrent tree 60k files (scale probe)", function* treeHuge() {
    const files = makeRelease(40_000, "Library");
    const checksum = yield () => treeChecksum(buildTorrentTree(files).nodes);
    return checksum;
  });
});
