import { X } from "lucide-react";
import { Button } from "../ui/button.component";

function Player({ header, onClose }: { header: string; onClose: () => void }) {
  return (
    <main className="flex flex-col mr-1 windows95-active-border bg-primary">
      <section className="flex flex-row items-center justify-between bg-secondary w-full p-1">
        <span className="text-white windows95-text font-bold line-clamp-1">
          {header}
        </span>
        <Button size="icon" className="size-4" onClick={onClose}>
          <X />
        </Button>
      </section>
      <section className="bg-black text-primary">Video Content</section>
      <section className="flex flex-col w-full border-b border-muted">
        <div>Timeline</div>
        <div>Controls</div>
      </section>
    </main>
  );
}

export default Player;
