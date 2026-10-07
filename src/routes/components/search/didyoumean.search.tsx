import { useI18n } from "@/hooks/i18n.hook";
import { findSubsequenceRanges, splitByRanges } from "@/lib/highlight/highlight.utils";

export default function DidYouMeanRow({
  correction,
  query,
  loading,
  resultCount,
  onPick,
}: {
  correction: string | null;
  query?: string;
  loading: boolean;
  resultCount: number;
  onPick: () => void;
}) {
  const { t } = useI18n();
  const diff =
    correction && query ? splitByRanges(correction, findSubsequenceRanges(correction, query)) : null;
  if (!correction || loading || resultCount > 0) return null;
  return (
    <button
      type="button"
      onClick={onPick}
      className="windows95-text hover:bg-surface px-1 py-0.5 text-left text-xs"
    >
      {t("search.did.you.mean")}{" "}
      {diff ? (
        <span className="font-bold">
          {diff.map((token, index) =>
            token.highlighted ? (
              <span key={index} className="text-highlight">
                {token.text}
              </span>
            ) : (
              <span key={index}>{token.text}</span>
            )
          )}
        </span>
      ) : (
        <span className="font-bold">{correction}</span>
      )}
    </button>
  );
}
