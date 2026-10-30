import type { ChangelogEntry } from "@/types/settings";

export interface ChangelogVersion {
  version: string;
  added: ChangelogEntry[];
  changed: ChangelogEntry[];
  fixed: ChangelogEntry[];
}
