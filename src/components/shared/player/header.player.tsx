import { Button } from "@/components/ui/button.component";
import { selectFullscreen, usePlayer } from "@videojs/react";
import { Maximize, X } from "lucide-react";

function Header({ header, onClose }: { header: string; onClose: () => void }) {
  const fullscreen = usePlayer(selectFullscreen);

  return (
    <main className="flex flex-row items-center justify-between bg-secondary w-full p-1">
      <span className="text-white windows95-text font-bold line-clamp-1">
        {header}
      </span>
      <div className="flex flex-row items-center gap-1">
        <Button
          size="icon"
          className="size-4"
          onClick={() => {
            fullscreen?.toggleFullscreen();
          }}
        >
          <Maximize />
        </Button>
        <Button size="icon" className="size-4" onClick={onClose}>
          <X />
        </Button>
      </div>
    </main>
  );
}

export default Header;
