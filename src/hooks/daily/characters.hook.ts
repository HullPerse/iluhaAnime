import { useMutation, useQueryClient } from "@tanstack/react-query";
import { playCharacters } from "@/api/characters.api";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { queryKeys } from "@/lib/core/hotkeys/keys.utils";
import type { SubmittedAnswers, CharactersView } from "@/types/api/characters";

/** SQLite owns round progress and the single reward transaction. */
export function useCharacters(day: string, enabled: boolean) {
  const client = useQueryClient();
  const key = ["daily-characters", day];
  const game = useAppQuery("static", {
    queryKey: key,
    queryFn: () => playCharacters(day),
    enabled,
    retry: false,
  });
  const guess = useMutation({
    mutationFn: ({ answers, submit }: { answers: SubmittedAnswers[]; submit: boolean }) =>
      playCharacters(day, answers, submit),
    onSuccess: (data) => {
      client.setQueryData<CharactersView>(key, (previous) =>
        previous?.finished && !data.finished ? previous : data
      );
      client.invalidateQueries({ queryKey: queryKeys.dailyGame(day) });

      if (data.rewardPackId) {
        client.invalidateQueries({ queryKey: queryKeys.cardsPacksScope() });
        client.invalidateQueries({ queryKey: queryKeys.cardsShellScope() });
      }
    },
  });

  return { game, guess };
}
