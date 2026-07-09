import { useEffect } from "react";
import { Channel, invoke } from "@tauri-apps/api/core";

export function useProgressStream(
  streamId: number | null,
  onProgress: (progress: number) => void,
) {
  useEffect(() => {
    if (streamId === null || streamId === undefined) return;

    const channel = new Channel<number>();
    channel.onmessage = onProgress;

    invoke("subscribe_progress", { streamId, channel }).catch(() => {
      // stream already completed — ignore
    });
  }, [streamId]);
}
