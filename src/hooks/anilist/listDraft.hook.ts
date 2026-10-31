import { useEffect, useRef, useState } from "react";

import { flagOrFalse, numText, textOrEmpty } from "@/lib/anilist/listEntry.utils";
import type { ListEntryDraft } from "@/types/anilist/listEntry";

export function useListDraft(animeId: number, listEntry: ListEntryDraft | undefined) {
  const [editStatus, setEditStatus] = useState<string>(listEntry?.list_status ?? "PLANNING");
  const [editProgress, setEditProgress] = useState<string>(numText(listEntry?.progress));
  const [editScore, setEditScore] = useState<string>(numText(listEntry?.score));
  const [editNotes, setEditNotes] = useState<string>(textOrEmpty(listEntry?.notes));
  const [editRepeat, setEditRepeat] = useState<string>(numText(listEntry?.repeat));
  const [editPrivate, setEditPrivate] = useState<boolean>(flagOrFalse(listEntry?.private));
  const [editHidden, setEditHidden] = useState<boolean>(
    flagOrFalse(listEntry?.hidden_from_status_lists)
  );
  const [editStarted, setEditStarted] = useState<string>(textOrEmpty(listEntry?.started_at));
  const [editCompleted, setEditCompleted] = useState<string>(textOrEmpty(listEntry?.completed_at));
  const [editCustomLists, setEditCustomLists] = useState<string[]>(listEntry?.custom_lists ?? []);
  const [flagsTouched, setFlagsTouched] = useState<boolean>(false);

  const syncedAnimeId = useRef<number>(animeId);
  useEffect(() => {
    if (syncedAnimeId.current === animeId) return;
    syncedAnimeId.current = animeId;
    setEditStatus(listEntry?.list_status ?? "PLANNING");
    setEditProgress(numText(listEntry?.progress));
    setEditScore(numText(listEntry?.score));
    setEditNotes(textOrEmpty(listEntry?.notes));
    setEditRepeat(numText(listEntry?.repeat));
    setEditPrivate(flagOrFalse(listEntry?.private));
    setEditHidden(flagOrFalse(listEntry?.hidden_from_status_lists));
    setEditStarted(textOrEmpty(listEntry?.started_at));
    setEditCompleted(textOrEmpty(listEntry?.completed_at));
    setEditCustomLists(listEntry?.custom_lists ?? []);
    setFlagsTouched(false);
  }, [animeId, listEntry]);

  return {
    editStatus,
    setEditStatus,
    editProgress,
    setEditProgress,
    editScore,
    setEditScore,
    editNotes,
    setEditNotes,
    editRepeat,
    setEditRepeat,
    editPrivate,
    setEditPrivate,
    editHidden,
    setEditHidden,
    editStarted,
    setEditStarted,
    editCompleted,
    setEditCompleted,
    editCustomLists,
    setEditCustomLists,
    flagsTouched,
    setFlagsTouched,
  };
}
