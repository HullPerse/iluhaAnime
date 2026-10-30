import type { TFunc } from "@/types/core/i18n";
import type { TorrentCheckResult } from "@/types/torrent/torrent";
import type { RecheckNotice } from "@/types/core/recheck";

export function describeRecheckOutcome(result: TorrentCheckResult, t: TFunc): RecheckNotice {
  if (result.missing.length === 0 && result.size_mismatch.length === 0) {
    return {
      tone: "success",
      message: t("torrent.recheck.ok", { ok: result.ok, total: result.total }),
    };
  }
  const parts: string[] = [];
  if (result.missing.length > 0) {
    parts.push(t("torrent.recheck.missing", { count: result.missing.length }));
  }
  if (result.size_mismatch.length > 0) {
    parts.push(t("torrent.recheck.size", { count: result.size_mismatch.length }));
  }
  return {
    tone: "error",
    message: `${parts.join("; ")} ${t("torrent.recheck.summary", { ok: result.ok, total: result.total })}`,
  };
}
