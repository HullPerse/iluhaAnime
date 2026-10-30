import type { TranslationKey } from "@/types/i18n";
import type { TorrentProblemCause, TorrentProblemDescriptor } from "@/types/problem";

const HEADLINE_KEY: Record<TorrentProblemCause, TranslationKey> = {
  missing: "torrent.problem.missing",
  noAccess: "torrent.problem.noAccess",
  readOnly: "torrent.problem.readOnly",
  diskFull: "torrent.problem.diskFull",
  diskError: "torrent.problem.diskError",
  noPeers: "torrent.problem.noPeers",
  other: "torrent.problem.other",
  unknown: "torrent.problem.unknown",
};

const CAUSE_MATCHERS: readonly { cause: TorrentProblemCause; tests: (lower: string) => boolean }[] =
  [
    {
      cause: "noAccess",
      tests: (lower) =>
        lower.includes("permission denied") ||
        lower.includes("operation not permitted") ||
        lower.includes("access is denied") ||
        lower.includes("os error 5"),
    },
    {
      cause: "readOnly",
      tests: (lower) => lower.includes("read-only") || lower.includes("read only"),
    },
    {
      cause: "diskFull",
      tests: (lower) =>
        lower.includes("no space") ||
        lower.includes("disk quota") ||
        lower.includes("not enough space") ||
        lower.includes("insufficient space"),
    },
    {
      cause: "missing",
      tests: (lower) =>
        lower.includes("no such file") ||
        lower.includes("missing") ||
        (lower.includes("not found") && lower.includes("file")),
    },
    {
      cause: "diskError",
      tests: (lower) =>
        lower.includes("input/output") ||
        lower.includes("i/o error") ||
        lower.includes("failed to write") ||
        lower.includes("failed to read"),
    },
    {
      cause: "noPeers",
      tests: (lower) =>
        lower.includes("no reachable peers") ||
        lower.includes("no peers") ||
        lower.includes("metadata") ||
        lower.includes("tracker") ||
        lower.includes("timed out"),
    },
  ];

function causeFromMessage(raw: string): TorrentProblemCause {
  const lower = raw.toLowerCase();
  const hit = CAUSE_MATCHERS.find((entry) => entry.tests(lower));
  return hit ? hit.cause : "other";
}

export function describeTorrentProblem(
  error: string | null,
  missingFiles: boolean
): TorrentProblemDescriptor {
  if (missingFiles) return { cause: "missing", headlineKey: HEADLINE_KEY.missing };
  if (!error) return { cause: "unknown", headlineKey: HEADLINE_KEY.unknown };
  const cause = causeFromMessage(error);
  return { cause, headlineKey: HEADLINE_KEY[cause] };
}
