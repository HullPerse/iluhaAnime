import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
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

function dailyProxy(mode: DailyMode): string | null {
  const proxy =
    mode === "frames"
      ? settingsAtoms.dailyProxyUrl.get()
      : settingsAtoms.dailyOpeningProxyUrl.get();
  return effectiveProxyUrl(proxy, settingsAtoms.anilistProxyUrl.get());
}

const PREPARE_TIMEOUT_MS = 90_000;
const OP_PREPARE_TIMEOUT_MS = 260_000;
const REVEAL_TIMEOUT_MS = 160_000;

/// A win mints the reward pack on the backend, but the packs tab and the tab
/// badges keep their own caches. Invalidating them here makes the new pack
/// appear on the next packs visit instead of after the five-minute stale time.
function invalidateDailyResult(
  queryClient: QueryClient,
  day: string,
  rewardPackId: string | null | undefined
): void {
  queryClient.invalidateQueries({ queryKey: queryKeys.dailyGame(day) });
  queryClient.invalidateQueries({ queryKey: queryKeys.dailyHistory() });
  if (rewardPackId === null || rewardPackId === undefined) return;
  queryClient.invalidateQueries({ queryKey: queryKeys.cardsPacksScope() });
  queryClient.invalidateQueries({ queryKey: queryKeys.cardsUnreadScope() });
}

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
        dailyApi.prepare(day, mode, dailyProxy(mode)),
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
        dailyApi.revealFrames(day, dailyProxy("frames")),
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
    mutationFn: (): Promise<DailyOpView> => dailyApi.prepareOp(day, dailyProxy("op")),
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
    mutationFn: (): Promise<DailyOpView> => dailyApi.prepareAudio(day, dailyProxy("audio")),
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
        dailyApi.prepareOp(day, dailyProxy("op")),
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
        dailyApi.prepareAudio(day, dailyProxy("audio")),
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
    mutationFn: (vars: { mediaId: number }): Promise<DailyOpGuessView> =>
      dailyApi.guessAudio(day, vars.mediaId, dailyProxy("audio")),
    onSuccess: (view) => {
      invalidateDailyResult(queryClient, day, view.state.result?.rewardPackId);
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
    mutationFn: (vars: { mediaId: number }): Promise<DailyOpGuessView> =>
      dailyApi.guessOp(day, vars.mediaId, dailyProxy("op")),
    onSuccess: (view) => {
      invalidateDailyResult(queryClient, day, view.state.result?.rewardPackId);
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
    mutationFn: (vars: { mode: DailyMode; mediaId: number }) =>
      dailyApi.guess(day, vars.mode, vars.mediaId, dailyProxy(vars.mode)),
    onSuccess: (view) => {
      invalidateDailyResult(queryClient, day, view.result?.rewardPackId);
    },
  });
}

export function useSkipDailyGame(day: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mode: DailyMode) => dailyApi.skip(day, mode, dailyProxy(mode)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dailyGame(day) });
    },
  });
}
