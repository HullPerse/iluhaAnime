import { useQuery } from "@tanstack/react-query";

import Modal from "@/components/shared/modal.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import type { AniMedia } from "@/types/anilist";
import type { AniDetailProps as DetailProps } from "@/types/anilist";

import { AniListDetailView } from "./view.detail";

function AniListDetailModal(props: DetailProps) {
  const { t } = useI18n();
  const query = useQuery({
    queryKey: ["anime_detail", props.animeId],
    queryFn: () => invokeTyped<AniMedia>("get_anime_by_id", { id: props.animeId }),
    staleTime: 1000 * 60 * 60,
    retry: 1,
  });
  return (
    <Modal
      header={query.data?.title ?? t("anilist.details.loading")}
      onClose={props.onClose}
      onBack={props.onBack}
      className="min-w-2xl"
    >
      <AniListDetailView
        {...props}
        anime={query.data}
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        refetch={query.refetch}
      />
    </Modal>
  );
}

export default AniListDetailModal;
