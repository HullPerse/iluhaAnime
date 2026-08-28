import { useDroppable } from "@dnd-kit/core";
import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { ChevronDown, ChevronRight, EyeOff, RefreshCw, X } from "lucide-react";
import { useState, useEffect, useRef, useMemo } from "react";

import UserImageIcon from "@/components/shared/avatar.component";
import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { Input } from "@/components/ui/input.component";
import { useI18n } from "@/lib/i18n";
import { normalizePlayerPath } from "@/lib/player.visibility";
import { fmtSize } from "@/lib/torrent.utils";
import { isUserImageIcon } from "@/lib/userimage.utils";
import { useCategoryStore } from "@/store/category.store";
import { useTorrentStore } from "@/store/download.store";
import type { FolderNode } from "@/types";
import type { TorrentInfo, TorrentFileInfo } from "@/types/torrent";

import TorrentFilesSection from "../torrent/file.torrent";
import CategoryIconModal from "./category/icon.category";
import FolderView from "./folder.player";

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
        { path: tor.save_dir! }
      ).then((result) =>
        result.map((f) => ({ name: f.name, size: f.size, fullPath: f.path }))
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
  onHideFolder,
  onHideTorrent,
}: {
  categoryId: string;
  onRemoveCategory: (id: string) => void;
  folderTrees: FolderNode[];
  torrents: TorrentInfo[];
  torrentFilesMap: Record<number, TorrentFileInfo[] | undefined>;
  audioExtensions: string[];
  onHideFolder?: (path: string) => void;
  onHideTorrent?: (infoHash: string) => void;
}) {
  const category = useCategoryStore((s) =>
    s.categories.find((c) => c.id === categoryId)
  );
  const entries = useCategoryStore((s) => s.entries[categoryId]);
  const renameCategory = useCategoryStore((s) => s.renameCategory);
  const removeEntry = useCategoryStore((s) => s.removeEntry);
  const { t } = useI18n();

  const { setNodeRef, isOver } = useDroppable({ id: categoryId });

  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editIcon, setEditIcon] = useState(false);
  const [editName, setEditName] = useState("");
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(
    new Set()
  );
  const renameRef = useRef<HTMLInputElement>(null);
  const audioExtensionsSet = useMemo(
    () => new Set(audioExtensions),
    [audioExtensions]
  );

  useEffect(() => {
    if (editing) {
      renameRef.current?.focus();
    }
  }, [editing]);

  if (!category) return null;
  const visibleEntries = (entries ?? []).filter((entry) =>
    entry.type === "folder"
      ? folderTrees.some(
          (tree) =>
            normalizePlayerPath(tree.path) ===
            normalizePlayerPath(entry.folderPath ?? "")
        )
      : torrents.some((torrent) => torrent.info_hash === entry.infoHash)
  );
  const count = visibleEntries.length;

  const renderFolderEntry = (entry: (typeof entries)[0]) => {
    const tree = folderTrees.find(
      (candidate) =>
        normalizePlayerPath(candidate.path) ===
        normalizePlayerPath(entry.folderPath ?? "")
    );
    if (!tree) return null;
    return (
      <FolderView
        node={tree}
        depth={0}
        searchQuery=""
        onHide={onHideFolder}
        disabledExtensions={audioExtensionsSet}
        hideRoot
      />
    );
  };

  const renderTorrentEntry = (entry: (typeof entries)[0]) => {
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
      className={`windows95-active-border bg-primary flex flex-col ${isOver ? "ring-highlight ring-2" : ""}`}
    >
      <section className="windows95-text flex w-full items-center gap-1 px-0.5 py-0.5 text-left select-none">
        <button
          type="button"
          aria-expanded={open}
          aria-label={category.name}
          className="windows95-text hover:bg-surface focus-visible:outline-text flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-left focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-dotted"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? (
            <ChevronDown className="size-3 shrink-0" />
          ) : (
            <ChevronRight className="size-3 shrink-0" />
          )}
        </button>
        {isUserImageIcon(category.icon) ? (
          <UserImageIcon
            icon={category.icon}
            alt=""
            className="border-surface size-4 shrink-0 hover:border"
            onClick={(e) => {
              e.stopPropagation();
              handleEditIcon();
            }}
          />
        ) : (
          <ImageComponent
            src={`/images/${category.icon}`}
            alt=""
            className="border-surface size-4 shrink-0 hover:border"
            onClick={(e) => {
              e.stopPropagation();
              handleEditIcon();
            }}
          />
        )}
        {editing ? (
          <Input
            ref={renameRef}
            className="h-5 min-w-0 flex-1 text-xs"
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
            className="w-fit truncate select-none"
            title={category.name}
            onClick={(e) => {
              e.stopPropagation();
              handleStartEdit();
            }}
          >
            {category.name}
          </span>
        )}
        <span className="text-hint ml-auto text-xs whitespace-nowrap select-none">
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

      {open && visibleEntries.length > 0 && (
        <section className="flex flex-col gap-0.5 px-1 pb-1">
          {[...visibleEntries]
            .sort((a, b) => a.type.localeCompare(b.type))
            .map((entry) => {
              const entryExpanded = expandedEntries.has(entry.id);
              return (
                <div key={entry.id} className="flex flex-col">
                  <div className="windows95-text flex items-center gap-1 px-1 py-0.5 select-none">
                    <button
                      type="button"
                      aria-expanded={entryExpanded}
                      aria-label={entry.name}
                      className="windows95-text hover:bg-surface focus-visible:outline-text flex min-w-0 flex-1 cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-left focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-dotted"
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
                            ? "/images/w2k_folder_closed.ico"
                            : "/images/w2k_floppy.ico"
                        }
                        alt=""
                        className="size-4 shrink-0"
                      />
                      <span className="truncate text-xs" title={entry.name}>
                        {entry.name}
                      </span>
                    </button>
                    {entry.totalBytes != null && (
                      <span className="text-hint text-xs whitespace-nowrap">
                        {fmtSize(entry.totalBytes)}
                      </span>
                    )}
                    {entry.type === "torrent" &&
                      entry.infoHash &&
                      onHideTorrent && (
                        <Button
                          size="icon"
                          className="size-4"
                          title={t("player.visibility.hide")}
                          onClick={(e) => {
                            e.stopPropagation();
                            onHideTorrent(entry.infoHash!);
                          }}
                        >
                          <EyeOff className="size-3" />
                        </Button>
                      )}
                    {entry.type === "torrent" && entry.torrentId != null && (
                      <Button
                        size="icon"
                        className="size-4"
                        onClick={(e) => {
                          e.stopPropagation();
                          useTorrentStore
                            .getState()
                            .loadTorrentFiles(entry.torrentId!);
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
