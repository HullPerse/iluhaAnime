import { useMemo } from "react";

import { emojiApi } from "@/api/emoji.api";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { queryKeys } from "@/lib/query/keys.utils";
import { assetUrl } from "@/lib/utils/image.utils";

// Absent folder yields empty map.
export function useCustomEmoji(): ReadonlyMap<string, string> {
  const { data } = useAppQuery<Awaited<ReturnType<typeof emojiApi.list>>>("static", {
    queryFn: () => emojiApi.list(),
    queryKey: queryKeys.customEmoji(),
  });

  return useMemo(() => {
    // IPC result degrades to empty instead of crashing.
    if (!Array.isArray(data)) return new Map<string, string>();
    return new Map(data.map((file) => [file.name, assetUrl(file.path)]));
  }, [data]);
}
