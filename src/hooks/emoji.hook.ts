import { useMemo } from "react";

import { emojiApi } from "@/api/emoji.api";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { queryKeys } from "@/lib/query/keys.utils";
import { assetUrl } from "@/lib/utils/image.utils";

export function useCustomEmoji(): ReadonlyMap<string, string> {
  const { data } = useAppQuery<Awaited<ReturnType<typeof emojiApi.list>>>("static", {
    queryFn: () => emojiApi.list(),
    queryKey: queryKeys.customEmoji(),
  });

  return useMemo(() => {
    if (!Array.isArray(data)) return new Map<string, string>();
    return new Map(data.map((file) => [file.name, assetUrl(file.path)]));
  }, [data]);
}
