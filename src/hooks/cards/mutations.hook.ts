import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { cardsApi } from "@/api/cards.api";
import { queryKeys } from "@/lib/core/hotkeys/keys.utils";
import { setCardsAlbumReadAt, setCardsPacksReadAt } from "@/store/cards.store";
import { settingsAtoms } from "@/store/settings.store";
import type {
  CardGallery,
  CardGiftClaimInput,
  CardKind,
  CardsSeenTab,
  CreateGiftInput,
  DustCardInput,
} from "@/types/api/cards";

function anilistProxy(): string | null {
  return settingsAtoms.anilistProxyUrl.get() ?? null;
}

export function useCardsMutations() {
  const queryClient = useQueryClient();
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const invalidate = () => {
    for (const queryKey of [
      queryKeys.cardsBootstrap(),
      queryKeys.cardsPacksScope(),
      queryKeys.cardsCollectionScope(),
      queryKeys.cardsCollectionsScope(),
      queryKeys.cardsStats(),
      queryKeys.cardsStarterStatusScope(),
      queryKeys.cardsGiftsScope(),
      queryKeys.cardsUnreadScope(),
    ]) {
      queryClient.invalidateQueries({ queryKey });
    }
  };

  const resetCollection = useMutation({
    mutationFn: () => cardsApi.resetCollection(),
    onSuccess: invalidate,
  });

  const setPreferredImage = useMutation({
    mutationFn: (vars: { kind: CardKind; entityId: number; imageUrl: string | null }) =>
      cardsApi.setPreferredImage(vars.kind, vars.entityId, vars.imageUrl),
    onSuccess: (changed, vars) => {
      if (changed === 0) return;
      const proxy = anilistProxy() ?? "";
      queryClient.setQueryData<CardGallery>(
        queryKeys.cardsGallery(vars.kind, vars.entityId, proxy),
        (current) => (current === undefined ? current : { ...current, preferredUrl: vars.imageUrl })
      );
      invalidate();
    },
  });

  const setCardVariant = useMutation({
    mutationFn: (vars: {
      kind: Parameters<typeof cardsApi.setCardVariant>[0];
      entityId: Parameters<typeof cardsApi.setCardVariant>[1];
      variant: Parameters<typeof cardsApi.setCardVariant>[2];
    }) => cardsApi.setCardVariant(vars.kind, vars.entityId, vars.variant),
    onSuccess: invalidate,
  });

  const setCardFavorite = useMutation({
    mutationFn: (vars: {
      kind: Parameters<typeof cardsApi.setCardFavorite>[0];
      entityId: Parameters<typeof cardsApi.setCardFavorite>[1];
      favorite: Parameters<typeof cardsApi.setCardFavorite>[2];
    }) => cardsApi.setCardFavorite(vars.kind, vars.entityId, vars.favorite),
    onSuccess: (favorite, vars) => {
      queryClient.setQueryData(queryKeys.cardsCardFavorite(vars.kind, vars.entityId), favorite);
      invalidate();
    },
  });

  // oxlint-disable-next-line react-doctor/query-mutation-missing-invalidation
  const openPack = useMutation({
    mutationFn: (packId: string) => cardsApi.openPack(packId, anilistProxy()),
    onSuccess: () => {
      if (!mounted.current) invalidate();
    },
  });

  // oxlint-disable-next-line react-doctor/query-mutation-missing-invalidation
  const claimPack = useMutation({
    mutationFn: (vars: { packId: string; slot: number }) =>
      cardsApi.claimPack(vars.packId, vars.slot),
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
    mutationFn: (input: CreateGiftInput) => cardsApi.createGift(input),
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

  const markSeen = useMutation({
    mutationFn: (vars: { tab: CardsSeenTab; at?: number }) => cardsApi.markSeen(vars.tab, vars.at),
    onSuccess: (seen, vars) => {
      if (vars.tab === "packs") setCardsPacksReadAt(seen.packsReadAt);
      else setCardsAlbumReadAt(seen.albumReadAt);
      queryClient.invalidateQueries({ queryKey: queryKeys.cardsShellScope() });
      queryClient.invalidateQueries({ queryKey: queryKeys.cardsUnreadScope() });
    },
  });

  return {
    resetCollection,
    setPreferredImage,
    setCardVariant,
    setCardFavorite,
    openPack,
    claimPack,
    dust,
    buyPack,
    createGift,
    claimGift,
    markGiftClaimed,
    deleteGift,
    grantStarter,
    markSeen,
    invalidate,
  };
}
