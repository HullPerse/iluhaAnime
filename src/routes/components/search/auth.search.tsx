import { Button } from "@/components/ui/button.component";
import { UserPlus, LogOut } from "lucide-react";

interface Props {
  source: string;
  rutrackerAuth: boolean;
  nekobtAuth: boolean;
  onLoginOpen: () => void;
  onApiModalOpen: () => void;
  onLogout: () => Promise<void>;
  onNekoBtLogout: () => Promise<void>;
}

export default function SearchAuthButtons({
  source,
  rutrackerAuth,
  nekobtAuth,
  onLoginOpen,
  onApiModalOpen,
  onLogout,
  onNekoBtLogout,
}: Props) {
  return (
    <>
      {source === "rutracker" && !rutrackerAuth && (
        <Button variant="default" size="icon" onClick={onLoginOpen}>
          <UserPlus />
        </Button>
      )}

      {source === "nekobt" && !nekobtAuth && (
        <Button variant="default" onClick={onApiModalOpen}>
          ключ
        </Button>
      )}

      {((source === "nekobt" && nekobtAuth) || (source === "rutracker" && rutrackerAuth)) && (
        <Button
          size="icon"
          variant="error"
          onClick={source === "rutracker" ? onLogout : onNekoBtLogout}
        >
          <LogOut />
        </Button>
      )}
    </>
  );
}
