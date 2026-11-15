import { useMutation, useQueryClient } from "@tanstack/react-query";
import { withTimeout } from "@hullperse/hp_utils/result";

import { dailyApi } from "@/api/daily.api";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { queryKeys } from "@/lib/core/hotkeys/keys.utils";
import { effectiveProxyUrl } from "@/lib/core/system/proxy.utils";
import { settingsAtoms } from "@/store/settings.store";
import type {
  DailyBootstrap,
  DailyFramesView,
  DailyHistoryItem,
  DailyMode,
  DailyOpGuessView,
  DailyOpView,
  DailySearchEntry,
} from "@/types/api/daily";

function dailyProxy(): string | null {
  return effectiveProxyUrl(settingsAtoms.dailyProxyUrl.get(), settingsAtoms.anilistProxyUrl.get());
}

const PREPARE_TIMEOUT_MS = 50_000;
const OP_PREPARE_TIMEOUT_MS = 200_000;
const REVEAL_TIMEOUT_MS = 160_000;

export function useDailyGame(day: string) {
  return useAppQuery<DailyBootstrap>("static", {
    queryKey: queryKeys.dailyGame(day),
    queryFn: () => dailyApi.bootstrap(day),
  });
}

export function useDailySearchIndex() {
  return useAppQuery<DailySearchEntry[]>("static", {
    queryKey: queryKeys.dailySearchIndex(),
    queryFn: () => dailyApi.searchIndex(),
    retry: false,
  });
}

export function useDailyGameHistory(day: string, mode: DailyMode, enabled: boolean) {
  return useAppQuery<DailyHistoryItem[]>("slow", {
    queryKey: queryKeys.dailyHistoryFor(day, mode),
    queryFn: () => dailyApi.history(day, mode),
    enabled,
  });
}

export function usePrepareDailyGame(day: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (mode: DailyMode) => {
      const result = await withTimeout(
        dailyApi.prepare(day, mode, dailyProxy()),
        PREPARE_TIMEOUT_MS,
        "preparing daily frames timed out"
      );
      if (!result.ok) throw result.error;
      return result.value;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dailyGame(day) });
    },
  });
}

/// Silent warm-up: the card screen starts the download before the player
/// clicks, so the mutation on click usually finds a ready clip.
/// The win screen asks for the frames that were never reached. The backend
/// downloads only the missing slots and returns the full set.
export function useRevealDailyFrames(day: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<DailyFramesView> => {
      const result = await withTimeout(
        dailyApi.revealFrames(day, dailyProxy()),
        REVEAL_TIMEOUT_MS,
        "revealing daily frames timed out"
      );
      if (!result.ok) throw result.error;
      return result.value;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dailyGame(day) });
    },
  });
}

/// Silent warm-up: the card screen starts the download before the player
/// clicks, so the mutation on click usually finds a ready clip.
export function useWarmDailyOp(day: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (): Promise<DailyOpView> => dailyApi.prepareOp(day, dailyProxy()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dailyGame(day) });
    },
  });
}

/// Same warm-up for the audio card: hovering it starts the download, so the
/// click usually joins a running request instead of starting a cold one.
export function useWarmDailyAudio(day: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (): Promise<DailyOpView> => dailyApi.prepareAudio(day, dailyProxy()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dailyGame(day) });
    },
  });
}

export function usePrepareDailyOp(day: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<DailyOpView> => {
      const result = await withTimeout(
        dailyApi.prepareOp(day, dailyProxy()),
        OP_PREPARE_TIMEOUT_MS,
        "preparing the daily opening timed out"
      );
      if (!result.ok) throw result.error;
      return result.value;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dailyGame(day) });
    },
  });
}

export function usePrepareDailyAudio(day: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<DailyOpView> => {
      const result = await withTimeout(
        dailyApi.prepareAudio(day, dailyProxy()),
        OP_PREPARE_TIMEOUT_MS,
        "preparing the daily audio clip timed out"
      );
      if (!result.ok) throw result.error;
      return result.value;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dailyGame(day) });
    },
  });
}

export function useGuessDailyAudio(day: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { mediaId: number; guessedTitles: string[] }): Promise<DailyOpGuessView> =>
      dailyApi.guessAudio(day, vars.mediaId, vars.guessedTitles),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dailyGame(day) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dailyHistory() });
    },
  });
}

export function useSkipDailyAudio(day: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (): Promise<DailyOpGuessView> => dailyApi.skipAudio(day),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dailyGame(day) });
    },
  });
}

export function useGuessDailyOp(day: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { mediaId: number; guessedTitles: string[] }): Promise<DailyOpGuessView> =>
      dailyApi.guessOp(day, vars.mediaId, vars.guessedTitles),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dailyGame(day) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dailyHistory() });
    },
  });
}

export function useSkipDailyOp(day: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (): Promise<DailyOpGuessView> => dailyApi.skipOp(day),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dailyGame(day) });
    },
  });
}

export function useGuessDailyGame(day: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { mode: DailyMode; mediaId: number; guessedTitles: string[] }) =>
      dailyApi.guess(day, vars.mode, vars.mediaId, vars.guessedTitles, dailyProxy()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dailyGame(day) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dailyHistory() });
    },
  });
}

export function useSkipDailyGame(day: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mode: DailyMode) => dailyApi.skip(day, mode, dailyProxy()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dailyGame(day) });
    },
  });
}
