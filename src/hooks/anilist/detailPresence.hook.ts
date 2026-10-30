import { useEffect } from "react";
import { setPresenceDetail } from "@/store/presence.store";

export function useDetailPresence(
  media: { id: number; title: string } | undefined,
  fallbackId: number
): void {
  const title = media?.title;
  const id = media?.id ?? fallbackId;
  useEffect(() => {
    if (!title) return;
    setPresenceDetail({ id, title });
    return () => setPresenceDetail(null);
  }, [id, title]);
}
