import { usePlayerDiscordPresence } from "@/hooks/player/discordPresence.hook";
import { useStreamPin } from "@/hooks/player/streamPin.hook";
import type { StreamOpen } from "@/types/player/videoPlayer";

export function PlayerRuntime({
  stream,
  loadingFile,
}: {
  stream: StreamOpen | null;
  loadingFile: boolean;
}) {
  usePlayerDiscordPresence();
  useStreamPin(stream, loadingFile);

  return null;
}
