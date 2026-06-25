import { Button } from "@/components/ui/button.component";
import { selectFullscreen, usePlayer } from "@videojs/react";
import { Maximize, Minimize2, X, Maximize2, Settings } from "lucide-react";
import { ReactElement } from "react";

function Header({
  header,
  onClose,
  special,
  cinemaMode,
  onToggleCinema,
  onToggleSettings,
}: {
  header: string;
  onClose: () => void;
  special?: ReactElement;
  cinemaMode?: boolean;
  onToggleCinema?: () => void;
  onToggleSettings?: () => void;
}) {
  const fullscreen = usePlayer(selectFullscreen);

  return (
    <main className="flex flex-row items-center justify-between bg-secondary w-full p-1">
      <span className="text-white windows95-text font-bold line-clamp-1">
        {header}
      </span>

      <div className="flex flex-row items-center gap-1">
        {onToggleSettings && (
          <Button
            size="icon"
            className="size-4"
            onClick={onToggleSettings}
            title="Настройки"
          >
            <Settings className="size-3" />
          </Button>
        )}

        {onToggleCinema && (
          <Button
            size="icon"
            className="size-4"
            onClick={onToggleCinema}
            title={cinemaMode ? "Выйти из кинорежима" : "Кинорежим"}
          >
            {cinemaMode ? (
              <Minimize2 className="size-3" />
            ) : (
              <Maximize2 className="size-3" />
            )}
          </Button>
        )}

        <Button
          size="icon"
          className="size-4"
          onClick={() => {
            fullscreen?.toggleFullscreen();
          }}
        >
          <Maximize />
        </Button>
        {!special ? (
          <Button size="icon" className="size-4" onClick={onClose}>
            <X />
          </Button>
        ) : (
          special
        )}
      </div>
    </main>
  );
}

export default Header;
