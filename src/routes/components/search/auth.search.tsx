import { Key, LogOut, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { AuthSearchProps as Props } from "@/types/search";

export default function SearchAuthButtons({
  source,
  rutrackerAuth,
  nekobtAuth,
  eraiAuth,
  onLoginOpen,
  onApiModalOpen,
  onEraiLoginOpen,
  onLogout,
  onNekoBtLogout,
  onEraiLogout,
  layout = "toolbar",
}: Props) {
  const { t } = useI18n();
  const titlebar = layout === "titlebar";
  const iconButtonClass = titlebar ? "size-4" : undefined;
  const iconClass = titlebar ? "size-3" : undefined;
  return (
    <>
      {source === "erai-raws" && !eraiAuth && (
        <Button variant="default" size="icon" className={iconButtonClass} onClick={onEraiLoginOpen}>
          <UserPlus className={iconClass} />
        </Button>
      )}

      {source === "rutracker" && !rutrackerAuth && (
        <Button variant="default" size="icon" className={iconButtonClass} onClick={onLoginOpen}>
          <UserPlus className={iconClass} />
        </Button>
      )}
      {source === "nekobt" && !nekobtAuth && (
        <Button
          variant="default"
          size="icon"
          className={iconButtonClass}
          title={t("search.key")}
          onClick={onApiModalOpen}
        >
          <Key className={iconClass} />
        </Button>
      )}

      {((source === "nekobt" && nekobtAuth) ||
        (source === "rutracker" && rutrackerAuth) ||
        (source === "erai-raws" && eraiAuth)) && (
        <Button
          size="icon"
          variant="error"
          className={iconButtonClass}
          onClick={() => {
            if (source === "rutracker") return onLogout();
            if (source === "nekobt") return onNekoBtLogout();
            return onEraiLogout();
          }}
        >
          <LogOut className={iconClass} />
        </Button>
      )}
    </>
  );
}
