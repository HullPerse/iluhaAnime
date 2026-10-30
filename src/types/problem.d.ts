import type { TranslationKey } from "@/types/i18n";

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
