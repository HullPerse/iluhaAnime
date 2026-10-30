import { useMutation, useQueryClient } from "@tanstack/react-query";

import { gameApi } from "@/api/game.api";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { queryKeys } from "@/lib/core/keys.utils";

export const GAME_STORE_QUERY_KEY = queryKeys.gameStore();

/** The bundled chip8Archive index with local `installed` flags; offline-safe. */
export function useGameStore() {
  return useAppQuery("static", {
    queryKey: GAME_STORE_QUERY_KEY,
    queryFn: () => gameApi.storeEntries(),
  });
}

export function useGameStoreInstall() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => gameApi.installStoreRom(key),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: GAME_STORE_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: queryKeys.gameRoms() });
    },
  });
}
