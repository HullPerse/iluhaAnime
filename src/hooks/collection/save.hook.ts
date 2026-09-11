import type { useWizardForm } from "@/hooks/collection/wizard.hook";
import { anilistProxyArgs } from "@/lib/anilist/proxy.utils";
import { withStoredMedia } from "@/lib/collection/media.utils";
import { attempt } from "@/lib/utils/attempt.utils";
import { isDirectImageSrc } from "@/lib/utils/image.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { AniAnimeStaffEdge, AniCharacterEdge } from "@/types/anilist";
import type { CollectionItem, WizardPickedMedia } from "@/types/collection";

type WizardForm = ReturnType<typeof useWizardForm>;

async function resolveCoverBlobId(
  currentBlobId: string | null,
  url: string
): Promise<string | null> {
  if (currentBlobId) return currentBlobId;
  if (isDirectImageSrc(url)) return null;
  if (!url.startsWith("http://") && !url.startsWith("https://")) return null;
  const [data, error] = await attempt(
    invokeTyped<{ id: string }>("download_remote_image", {
      url,
      nameHint: "collection-cover",
    })
  );
  if (error) return null;
  return data.id;
}

export function useWizardSave({
  form,
  coverBlobIdRef,
  mediaRef,
  onSave,
  onClose,
}: {
  form: WizardForm;
  coverBlobIdRef: { current: string | null };
  mediaRef: { current: WizardPickedMedia | null };
  onSave: (item: Omit<CollectionItem, "id" | "addedAt" | "updatedAt">) => void;
  onClose: () => void;
}) {
  const handleSave = async () => {
    const { title, coverUrl, buildItem } = form;
    if (!title.trim() || !coverUrl) return;
    const blobId = await resolveCoverBlobId(coverBlobIdRef.current, coverUrl);
    const built = buildItem(blobId);
    const media = mediaRef.current;
    const base = media
      ? {
          ...built,
          detailsJson: withStoredMedia(built.detailsJson, media.stills, media.trailerYoutubeId),
        }
      : built;
    const anilistId = base.externalIds.anilist;
    if (!anilistId) {
      onSave(base);
      onClose();
      return;
    }
    const proxyArgs = anilistProxyArgs(useSettingsStore.getState().anilistProxyUrl);
    const [characters, staff] = await Promise.all([
      invokeTyped<AniCharacterEdge[]>("get_anime_characters", {
        id: anilistId,
        page: 1,
        ...proxyArgs,
      }).catch(() => [] as AniCharacterEdge[]),
      invokeTyped<AniAnimeStaffEdge[]>("get_anime_staff", {
        id: anilistId,
        ...proxyArgs,
      }).catch(() => [] as AniAnimeStaffEdge[]),
    ]);
    onSave({
      ...base,
      detailsJson: {
        ...base.detailsJson,
        staff: staff.length
          ? staff.slice(0, 30).map((s) => ({ id: s.id, name: s.name, role: s.role }))
          : (base.detailsJson?.staff ?? []),
        characters: characters.length
          ? characters.map((c) => ({
              id: c.character.id,
              name: c.character.name,
              voiceActors: c.voice_actors.slice(0, 3).map((v) => ({ id: v.id, name: v.name })),
            }))
          : (base.detailsJson?.characters ?? []),
      },
    });
    onClose();
  };

  return { handleSave };
}
