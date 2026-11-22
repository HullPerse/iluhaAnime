import { Heart } from "lucide-react";

import { MANGA_UNASSIGNED_STATUS } from "@/api/manga.api";
import type { LibraryCopy } from "@/api/manga.api";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";

export function LibraryFavourite({
  item,
  pendingFavourite,
  disabled,
  onToggle,
}: {
  item: LibraryCopy | undefined;
  pendingFavourite: boolean | undefined;
  disabled: boolean;
  onToggle: (id: string, next: boolean) => void;
}) {
  const { t } = useI18n();

  if (!item || item.status === MANGA_UNASSIGNED_STATUS) return null;

  const favourite = pendingFavourite ?? item.favourite ?? false;
  const label = t(favourite ? "manga.library.unfavourite" : "manga.library.favourite");

  return (
    <Button
      size="icon"
      className="size-6 shrink-0"
      title={label}
      aria-label={label}
      aria-pressed={favourite}
      disabled={disabled}
      onClick={() => onToggle(item.id, !favourite)}
    >
      <Heart
        className={favourite ? "text-destructive size-4 fill-current" : "size-4"}
        aria-hidden
      />
    </Button>
  );
}
