import type { ComponentProps } from "react";
import { useCell } from "@hullperse/hp_utils/react";
import { overlayAtoms } from "@/store/overlay.store";
import Updater from "@/components/shared/updater.component";

export function ShellOverlays({
  update,
  updatePromptOpen,
  closeUpdatePrompt,
}: {
  update: ComponentProps<typeof Updater>["update"] | null | undefined;
  updatePromptOpen: boolean;
  closeUpdatePrompt: () => void;
}) {
  const overlays = useCell(overlayAtoms.entries);

  if (!update || !updatePromptOpen || overlays.length > 0) return null;

  return <Updater update={update} onClose={closeUpdatePrompt} />;
}
