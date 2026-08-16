import { UserPlus, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/i18n";

interface Props {
  source: string;
  rutrackerAuth: boolean;
  nekobtAuth: boolean;
  eraiAuth: boolean;
  onLoginOpen: () => void;
  onApiModalOpen: () => void;
  onEraiLoginOpen: () => void;
  onLogout: () => Promise<void>;
  onNekoBtLogout: () => Promise<void>;
  onEraiLogout: () => Promise<void>;
}

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
}: Props) {
  const { t } = useI18n();
  return (
    <>
      {source === "erai-raws" && !eraiAuth && (
        <Button variant="default" size="icon" onClick={onEraiLoginOpen}>
          <UserPlus />
        </Button>
      )}

      {source === "rutracker" && !rutrackerAuth && (
        <Button variant="default" size="icon" onClick={onLoginOpen}>
          <UserPlus />
        </Button>
      )}

      {source === "nekobt" && !nekobtAuth && (
        <Button variant="default" onClick={onApiModalOpen}>
          {t("search.key")}
        </Button>
      )}

      {((source === "nekobt" && nekobtAuth) ||
        (source === "rutracker" && rutrackerAuth) ||
        (source === "erai-raws" && eraiAuth)) && (
        <Button
          size="icon"
          variant="error"
          onClick={() => {
            if (source === "rutracker") return onLogout();
            if (source === "nekobt") return onNekoBtLogout();
            return onEraiLogout();
          }}
        >
          <LogOut />
        </Button>
      )}
    </>
  );
}
