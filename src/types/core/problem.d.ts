import type { TranslationKey } from "@/types/core/i18n";

export type TorrentProblemCause =
  | "missing"
  | "noAccess"
  | "readOnly"
  | "diskFull"
  | "diskError"
  | "noPeers"
  | "other"
  | "unknown";

export interface TorrentProblemDescriptor {
  cause: TorrentProblemCause;
  headlineKey: TranslationKey;
}
