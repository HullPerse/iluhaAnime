import { useMemo } from "react";

import { emojiApi } from "@/api/emoji.api";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { queryKeys } from "@/lib/query/keys.utils";
import { assetUrl } from "@/lib/utils/image.utils";

/**
 * Custom lobby emoji (`iluha_*` files in `<app data>/emoji`) as a
 * name → image URL map. The set is static per scan, so it uses the `static`
 * preset; an absent folder just yields an empty map (the picker hides its
 * section and chat shortcodes fall back to plain text).
 */
export function useCustomEmoji(): ReadonlyMap<string, string> {
  const { data } = useAppQuery<Awaited<ReturnType<typeof emojiApi.list>>>("static", {
    queryFn: () => emojiApi.list(),
    queryKey: queryKeys.customEmoji(),
  });

  return useMemo(() => {
    // The command result crosses an IPC boundary: anything but a well-formed
    // list (a test stub, a protocol surprise) degrades to "no custom emoji"
    // instead of crashing the chat render.
    if (!Array.isArray(data)) return new Map<string, string>();
    return new Map(data.map((file) => [file.name, assetUrl(file.path)]));
  }, [data]);
}
