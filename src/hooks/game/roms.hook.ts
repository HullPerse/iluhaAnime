import { useMutation, useQueryClient } from "@tanstack/react-query";

import { gameApi } from "@/api/game.api";
import type { GameImportInput } from "@/api/game.api";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { queryKeys } from "@/lib/core/keys.utils";

export const GAME_ROMS_QUERY_KEY = queryKeys.gameRoms();

export function useGameRoms() {
  return useAppQuery("static", {
    queryKey: GAME_ROMS_QUERY_KEY,
    queryFn: () => gameApi.listRoms(),
  });
}

export function useGamePlatforms() {
  return useAppQuery("static", {
    queryKey: queryKeys.gamePlatforms(),
    queryFn: () => gameApi.platforms(),
  });
}

export function useGameRomMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: GAME_ROMS_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: queryKeys.gameStore() });
  };

  const importRom = useMutation({
    mutationFn: (input: GameImportInput) => gameApi.importRom(input),
    onSuccess: () => invalidate(),
  });
  const deleteRom = useMutation({
    mutationFn: (id: string) => gameApi.deleteRom(id),
    onSuccess: () => invalidate(),
  });
  return { importRom, deleteRom };
}
