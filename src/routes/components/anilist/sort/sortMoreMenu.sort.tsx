import {
  Activity,
  Hash,
  Infinity as InfinityIcon,
  Layers,
  MoreHorizontal,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { DropdownMenuCheckboxItem } from "@/components/ui/dropdown/checkboxItem.dropdown";
import { DropdownMenuContent } from "@/components/ui/dropdown/content.dropdown";
import { DropdownMenuGroup } from "@/components/ui/dropdown/group.dropdown";
import { DropdownMenuItem } from "@/components/ui/dropdown/item.dropdown";
import { DropdownMenu } from "@/components/ui/dropdown/menu.dropdown";
import { DropdownMenuRadioGroup } from "@/components/ui/dropdown/radioGroup.dropdown";
import { DropdownMenuRadioItem } from "@/components/ui/dropdown/radioItem.dropdown";
import { DropdownMenuSeparator } from "@/components/ui/dropdown/separator.dropdown";
import { DropdownMenuTrigger } from "@/components/ui/dropdown/trigger.dropdown";
import { useI18n } from "@/hooks/i18n.hook";

export function SortMoreMenu({
  onActivityOpen,
  onSpotlight,
  groupByStatus,
  onGroupChange,
  displayMode,
  onDisplayChange,
}: {
  onActivityOpen: () => void;
  onSpotlight: () => void;
  groupByStatus: boolean;
  onGroupChange: (grouped: boolean) => void;
  displayMode: "scroll" | "pagination";
  onDisplayChange: (mode: "scroll" | "pagination") => void;
}) {
  const { t } = useI18n();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            size="icon"
            className="h-6 w-6 shrink-0"
            title={t("anilist.sort.more")}
            aria-label={t("anilist.sort.more")}
          >
            <MoreHorizontal className="size-3.5" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" side="bottom" sideOffset={4} className="min-w-48">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={onActivityOpen}>
            <Activity className="size-4" />
            {t("anilist.sort.history")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onSpotlight}>
            <Sparkles className="size-4" />
            {t("anilist.sort.spotlight")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuCheckboxItem
            checked={groupByStatus}
            onCheckedChange={(checked) => onGroupChange(checked === true)}
            title={t("anilist.sort.group.by.status")}
          >
            <Layers className="size-4" />
            {t("anilist.sort.group.by.status")}
          </DropdownMenuCheckboxItem>
          <DropdownMenuRadioGroup
            value={displayMode}
            onValueChange={(v) => onDisplayChange(v as typeof displayMode)}
          >
            <DropdownMenuRadioItem value="scroll" title={t("anilist.sort.display.scroll")}>
              <InfinityIcon className="size-4" />
              {t("anilist.sort.display.scroll")}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="pagination" title={t("anilist.sort.display.pagination")}>
              <Hash className="size-4" />
              {t("anilist.sort.display.pagination")}
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
