import {
  Archive,
  Download,
  EllipsisVertical,
  Grid3x3,
  Hash,
  Infinity as InfinityIcon,
  List,
  Palette,
  Upload,
} from "lucide-react";
import { useRef } from "react";

import { Button } from "@/components/ui/button.component";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown.component";
import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/lib/i18n";
import { useCollectionStore } from "@/store/collection.store";

export default function DataCollection({
  onHandleJson,
  onHandleZip,
  onHandleImport,
  onHandleAnilist,
}: {
  onHandleJson: () => void;
  onHandleZip: () => void;
  onHandleImport: (file: File) => void;
  onHandleAnilist: () => void;
}) {
  const { t } = useI18n();
  const { coverDithered, viewMode, displayMode, setCoverDithered, setViewMode, setDisplayMode } =
    useCollectionStore();

  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button size="default" className="size-7" title={t("collection.data")}>
              <EllipsisVertical className="size-5" />
            </Button>
          }
        />

        <DropdownMenuContent
          align="end"
          side="bottom"
          sideOffset={4}
          className="min-w-48 overflow-y-auto"
        >
          <DropdownMenuGroup>
            <DropdownMenuRadioGroup
              value={viewMode}
              onValueChange={(v) => setViewMode(v as typeof viewMode)}
            >
              <DropdownMenuRadioItem
                value="grid"
                disabled={viewMode === "grid"}
                title={t("collection.view.mode")}
              >
                <Grid3x3 className="size-4" /> {t("collection.view.mode.grid")}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem
                value="list"
                disabled={viewMode === "list"}
                title={t("collection.view.mode")}
              >
                <List className="size-4" /> {t("collection.view.mode.list")}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            {viewMode === "grid" && (
              <DropdownMenuRadioGroup
                value={displayMode}
                onValueChange={(v) => setDisplayMode(v as typeof displayMode)}
              >
                <DropdownMenuRadioItem
                  value="scroll"
                  disabled={displayMode === "scroll"}
                  title={t("collection.display.mode")}
                >
                  <InfinityIcon className="size-4" /> {t("collection.display.mode.scroll")}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem
                  value="pagination"
                  disabled={displayMode === "pagination"}
                  title={t("collection.display.mode")}
                >
                  <Hash className="size-4" /> {t("collection.display.mode.pagination")}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            )}
            <DropdownMenuCheckboxItem
              checked={coverDithered}
              onCheckedChange={(checked) => setCoverDithered(checked)}
              title={t("collection.dither")}
            >
              <Palette className="size-4" /> {t("collection.dither")}
            </DropdownMenuCheckboxItem>
          </DropdownMenuGroup>
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={onHandleAnilist}>
              <ImageComponent
                src="https://anilist.co/favicon.ico"
                alt="A"
                className="size-4 opacity-50"
              />
              {t("collection.import.anilist.title")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onHandleJson}>
              <Download className="size-4" /> {t("collection.export.title")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onHandleZip}>
              <Archive className="size-4" /> {t("collection.export.zip")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => inputRef.current?.click()}>
              <Upload className="size-4" /> {t("collection.import.title")}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        ref={inputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onHandleImport(file);
        }}
      />
    </>
  );
}
