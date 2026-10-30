import { settingsAtoms, type SettingsAtoms } from "@/store/settings.store";
import { normalizePlayerPath } from "@/lib/core/visibility.utils";

export class PlayerVisibilityService {
  private readonly atoms: SettingsAtoms;

  constructor(atoms: SettingsAtoms) {
    this.atoms = atoms;
  }

  hidePlayerFolder(path: string): void {
    const cell = this.atoms.hiddenPlayerFolders;
    const normalized = path.replace(/\\/g, "/").replace(/\/$/, "").toLowerCase();
    const exists = cell
      .get()
      .some((value) => value.replace(/\\/g, "/").replace(/\/$/, "").toLowerCase() === normalized);
    if (!exists) cell.set([...cell.get(), path]);
  }

  unhidePlayerFolder(path: string): void {
    const cell = this.atoms.hiddenPlayerFolders;
    const normalized = path.replace(/\\/g, "/").replace(/\/$/, "").toLowerCase();
    cell.set(
      cell
        .get()
        .filter(
          (value) => value.replace(/\\/g, "/").replace(/\/$/, "").toLowerCase() !== normalized
        )
    );
  }

  hidePlayerTorrent(infoHash: string): void {
    const cell = this.atoms.hiddenPlayerTorrents;
    if (!cell.get().includes(infoHash)) cell.set([...cell.get(), infoHash]);
  }

  unhidePlayerTorrent(infoHash: string): void {
    const cell = this.atoms.hiddenPlayerTorrents;
    cell.set(cell.get().filter((value) => value !== infoHash));
  }

  setPlayerFolderHeight(path: string, height: number | null): void {
    const key = normalizePlayerPath(path);
    if (!key) return;
    const cell = this.atoms.playerFolderHeights;
    const heights = { ...cell.get() };
    if (height === null) delete heights[key];
    else heights[key] = height;
    cell.set(heights);
  }

  setPlayerTorrentHeight(infoHash: string, height: number | null): void {
    if (!infoHash) return;
    const cell = this.atoms.playerTorrentHeights;
    const heights = { ...cell.get() };
    if (height === null) delete heights[infoHash];
    else heights[infoHash] = height;
    cell.set(heights);
  }
}

export const playerVisibility = new PlayerVisibilityService(settingsAtoms);
