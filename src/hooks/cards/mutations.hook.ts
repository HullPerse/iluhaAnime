import { useMutation, useQueryClient } from "@tanstack/react-query";

import { cardsApi } from "@/api/cards.api";
import { queryKeys } from "@/lib/core/hotkeys/keys.utils";
import { settingsAtoms } from "@/store/settings.store";
import type { CardGiftClaimInput, DustCardInput } from "@/types/api/cards";

function anilistProxy(): string | null {
  return settingsAtoms.anilistProxyUrl.get() ?? null;
}

export function useCardsMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    for (const queryKey of [
      queryKeys.cardsBootstrap(),
      queryKeys.cardsPacksScope(),
      queryKeys.cardsCollectionScope(),
      queryKeys.cardsCollectionsScope(),
      queryKeys.cardsStats(),
      queryKeys.cardsGiftsScope(),
      queryKeys.cardsUnreadScope(),
    ]) {
      queryClient.invalidateQueries({ queryKey });
    }
  };

  const grantTestPack = useMutation({
    mutationFn: () => cardsApi.grantTestPack(),
    onSuccess: invalidate,
  });

  const grantTestLegendaryPack = useMutation({
    mutationFn: () => cardsApi.grantTestLegendaryPack(),
    onSuccess: invalidate,
  });

  const grantTestEffectsPack = useMutation({
    mutationFn: () => cardsApi.grantTestEffectsPack(),
    onSuccess: invalidate,
  });

  const resetCollection = useMutation({
    mutationFn: () => cardsApi.resetCollection(),
    onSuccess: invalidate,
  });

  const setCardVariant = useMutation({
    mutationFn: (vars: {
      kind: Parameters<typeof cardsApi.setCardVariant>[0];
      entityId: Parameters<typeof cardsApi.setCardVariant>[1];
      variant: Parameters<typeof cardsApi.setCardVariant>[2];
    }) => cardsApi.setCardVariant(vars.kind, vars.entityId, vars.variant),
    onSuccess: invalidate,
  });

  // The reveal owns this invalidation: it runs when the opening closes so the
  // wallet, counters and NEW stamps do not update before the cards are seen.
  // oxlint-disable-next-line react-doctor/query-mutation-missing-invalidation
  const openPack = useMutation({
    mutationFn: (packId: string) => cardsApi.openPack(packId, anilistProxy()),
  });

  const dust = useMutation({
    mutationFn: (input: DustCardInput) => cardsApi.dust(input),
    onSuccess: invalidate,
  });

  const buyPack = useMutation({
    mutationFn: (packKind: string) => cardsApi.buyPack(packKind),
    onSuccess: invalidate,
  });

  const createGift = useMutation({
    mutationFn: (input: DustCardInput) => cardsApi.createGift(input),
    onSuccess: invalidate,
  });

  const claimGift = useMutation({
    mutationFn: (input: CardGiftClaimInput) => cardsApi.claimGift(input),
    onSuccess: invalidate,
  });

  const markGiftClaimed = useMutation({
    mutationFn: (giftId: string) => cardsApi.markGiftClaimed(giftId),
    onSuccess: invalidate,
  });

  const deleteGift = useMutation({
    mutationFn: (giftId: string) => cardsApi.deleteGift(giftId),
    onSuccess: invalidate,
  });

  const grantStarter = useMutation({
    mutationFn: (userId: number) => cardsApi.grantStarter(userId, anilistProxy()),
    onSuccess: invalidate,
  });

  return {
    grantTestPack,
    grantTestLegendaryPack,
    grantTestEffectsPack,
    resetCollection,
    setCardVariant,
    openPack,
    dust,
    buyPack,
    createGift,
    claimGift,
    markGiftClaimed,
    deleteGift,
    grantStarter,
    invalidate,
  };
}
