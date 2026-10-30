import type { ChangelogEntry } from "@/types/ui/settings";

export interface ChangelogVersion {
  version: string;
  added: ChangelogEntry[];
  changed: ChangelogEntry[];
  fixed: ChangelogEntry[];
}
