export interface Category {
  id: string;
  icon: string;
  name: string;
  order: number;
  createdAt: number;
}

export interface CategoryEntry {
  id: string;
  type: "torrent" | "folder";
  name: string;
  torrentId?: number;
  infoHash?: string;
  saveDir?: string;
  totalBytes?: number;
  folderPath?: string;
}

export interface CategoryStore {
  categories: Category[];
  entries: Record<string, CategoryEntry[]>;

  addCategory: (name: string) => string;
  removeCategory: (id: string) => void;
  renameCategory: (id: string, name: string) => void;
  changeIcon: (id: string, icon: string) => void;
  reorderCategories: (ids: string[]) => void;
  addEntry: (categoryId: string, entry: Omit<CategoryEntry, "id">) => void;
  removeEntry: (categoryId: string, entryId: string) => void;
  removeEntriesByFolderPath: (path: string) => void;
  removeEntriesByTorrentId: (id: number) => void;
}
