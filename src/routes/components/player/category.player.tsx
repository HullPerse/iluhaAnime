import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { ChevronDown, ChevronRight, RefreshCw, X } from "lucide-react";
import { useDroppable } from "@dnd-kit/core";
import ImageComponent from "@/components/ui/image.component";
import { Input } from "@/components/ui/input.component";
import { Button } from "@/components/ui/button.component";
import { useCategoryStore } from "@/store/category.store";
import { fmtSize } from "@/lib/torrent.utils";
import FolderView from "./folder.player";
import TorrentFilesSection from "../torrent/file.torrent";
import type { FolderNode } from "@/types";
import type { TorrentInfo, TorrentFileInfo } from "@/types/torrent";
import { useTorrentStore } from "@/store/download.store";
import CategoryIconModal from "./category/icon.category";

function TorrentCategoryEntry({
  tor,
  torrentFilesMap,
}: {
  tor: TorrentInfo;
  torrentFilesMap: Record<number, TorrentFileInfo[] | undefined>;
}) {
  const { data = [], refetch } = useQuery({
    queryKey: ["extra_files", tor.save_dir],
    queryFn: () =>
      invoke<{ path: string; name: string; size: number }[]>(
        "scan_extra_files",
        { path: tor.save_dir! },
      ).then((result) =>
        result.map((f) => ({ name: f.name, size: f.size, fullPath: f.path })),
      ),
    enabled: !!tor.save_dir,
  });

  const files = (torrentFilesMap[tor.id] || []).filter((f) => f.completed);
  if (files.length === 0) return null;

  const handleUpscaleDone = () => refetch();
  const handleDeleteExtraFile = () => refetch();

  return (
    <TorrentFilesSection
      id={tor.id}
      files={files}
      type="player"
      path={tor.save_dir}
      extraFiles={data}
      onUpscaleDone={handleUpscaleDone}
      onDeleteExtraFile={handleDeleteExtraFile}
    />
  );
}

function CategoryView({
  categoryId,
  onRemoveCategory,
  folderTrees,
  torrents,
  torrentFilesMap,
  audioExtensions,
}: {
  categoryId: string;
  onRemoveCategory: (id: string) => void;
  folderTrees: FolderNode[];
  torrents: TorrentInfo[];
  torrentFilesMap: Record<number, TorrentFileInfo[] | undefined>;
  audioExtensions: string[];
}) {
  const category = useCategoryStore((s) =>
    s.categories.find((c) => c.id === categoryId),
  );
  const entries = useCategoryStore((s) => s.entries[categoryId]);
  const renameCategory = useCategoryStore((s) => s.renameCategory);
  const removeEntry = useCategoryStore((s) => s.removeEntry);

  const { setNodeRef, isOver } = useDroppable({ id: categoryId });

  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editIcon, setEditIcon] = useState(false);
  const [editName, setEditName] = useState("");
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(
    new Set(),
  );
  const inputId = `rename-${categoryId}`;

  useEffect(() => {
    if (editing) {
      const el = document.getElementById(inputId) as HTMLInputElement | null;
      el?.focus();
    }
  }, [editing, inputId]);

  if (!category) return null;
  const count = entries?.length ?? 0;

  const renderFolderEntry = (entry: typeof entries[0]) => {
    const tree = folderTrees.find((t) => t.path === entry.folderPath);
    if (!tree) return null;
    return (
      <FolderView
        node={tree}
        depth={0}
        searchQuery=""
        disabledExtensions={new Set(audioExtensions)}
        hideRoot
      />
    );
  };

  const renderTorrentEntry = (entry: typeof entries[0]) => {
    const tor = torrents.find((t) => t.info_hash === entry.infoHash);
    if (!tor) return null;
    return <TorrentCategoryEntry tor={tor} torrentFilesMap={torrentFilesMap} />;
  };

  const toggleEntry = (entryId: string) => {
    setExpandedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  };

  const handleStartEdit = () => {
    setEditName(category.name);
    setEditing(true);
  };

  const handleFinishEdit = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== category.name) {
      renameCategory(category.id, trimmed);
    }
    setEditing(false);
  };

  const handleEditIcon = () => setEditIcon(true);

  return (
    <main
      ref={setNodeRef}
      className={`flex flex-col windows95-active-border bg-primary ${isOver ? "ring-2 ring-highlight" : ""}`}
    >
      <section
        role="button"
        className="flex items-center gap-1 windows95-text cursor-pointer hover:bg-surface px-0.5 py-0.5 w-full text-left select-none"
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <ChevronDown className="size-3 shrink-0" />
        ) : (
          <ChevronRight className="size-3 shrink-0" />
        )}
        <ImageComponent
          src={`/icons/${category.icon}`}
          alt=""
          className="size-4 shrink-0 hover:border border-surface"
          onClick={(e) => {
            e.stopPropagation();
            handleEditIcon();
          }}
        />
        {editing ? (
          <Input
            id={inputId}
            className="h-5 text-xs flex-1 min-w-0"
            value={editName}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleFinishEdit();
              if (e.key === "Escape") setEditing(false);
            }}
            onBlur={handleFinishEdit}
            onChange={(e) => setEditName(e.target.value)}
          />
        ) : (
          <span
            className="truncate select-none w-fit"
            title={category.name}
            onClick={(e) => {
              e.stopPropagation();
              handleStartEdit();
            }}
          >
            {category.name}
          </span>
        )}
        <span className="text-muted whitespace-nowrap select-none text-[10px] ml-auto">
          {count}
        </span>
        <Button
          size="icon"
          className="size-5"
          onClick={(e) => {
            e.stopPropagation();
            onRemoveCategory(category.id);
          }}
        >
          <X className="size-4" />
        </Button>
      </section>

      {open && entries && entries.length > 0 && (
        <section className="flex flex-col gap-0.5 px-1 pb-1">
          {entries
            .sort((a, b) => a.type.localeCompare(b.type))
            .map((entry) => {
              const entryExpanded = expandedEntries.has(entry.id);
              return (
                <div key={entry.id} className="flex flex-col">
                  <div
                    className="flex items-center gap-1 windows95-text py-0.5 px-1 hover:bg-surface cursor-pointer select-none"
                    onClick={() => toggleEntry(entry.id)}
                  >
                    {entryExpanded ? (
                      <ChevronDown className="size-3 shrink-0" />
                    ) : (
                      <ChevronRight className="size-3 shrink-0" />
                    )}
                    <ImageComponent
                      src={
                        entry.type === "folder"
                          ? "/icons/w2k_folder_closed.ico"
                          : "/icons/w2k_floppy.ico"
                      }
                      alt=""
                      className="size-4 shrink-0"
                    />
                    <span
                      className="truncate flex-1 text-xs"
                      title={entry.name}
                    >
                      {entry.name}
                    </span>
                    {entry.totalBytes != null && (
                      <span className="text-muted text-[10px] whitespace-nowrap">
                        {fmtSize(entry.totalBytes)}
                      </span>
                    )}
                    {entry.type === "torrent" && entry.torrentId != null && (
                      <Button
                        size="icon"
                        className="size-4"
                        onClick={(e) => {
                          e.stopPropagation();
                          useTorrentStore.getState().loadTorrentFiles(entry.torrentId!);
                        }}
                      >
                        <RefreshCw className="size-3" />
                      </Button>
                    )}
                    <Button
                      size="icon"
                      className="size-4"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeEntry(category.id, entry.id);
                      }}
                    >
                      <X className="size-3" />
                    </Button>
                  </div>
                  {entryExpanded && (
                    <div className="pl-4">
                      {entry.type === "folder"
                        ? renderFolderEntry(entry)
                        : renderTorrentEntry(entry)}
                    </div>
                  )}
                </div>
              );
            })}
        </section>
      )}

      {editIcon && (
        <CategoryIconModal
          id={categoryId}
          handleClose={() => setEditIcon(false)}
        />
      )}
    </main>
  );
}

export default CategoryView;
