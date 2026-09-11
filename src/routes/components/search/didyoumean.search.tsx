import { useI18n } from "@/lib/locale/i18n.utils";

export default function DidYouMeanRow({
  correction,
  loading,
  resultCount,
  onPick,
}: {
  correction: string | null;
  loading: boolean;
  resultCount: number;
  onPick: () => void;
}) {
  const { t } = useI18n();
  if (!correction || loading || resultCount > 0) return null;
  return (
    <button
      type="button"
      onClick={onPick}
      className="windows95-text hover:bg-surface px-1 py-0.5 text-left text-xs"
    >
      {t("search.did.you.mean")} <span className="font-bold">{correction}</span>
    </button>
  );
}
