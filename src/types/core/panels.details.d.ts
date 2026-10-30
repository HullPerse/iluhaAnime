export type DetailsTab = "description" | "screenshots" | "files" | "mediainfo" | "comments";

export interface DetailsTabEntry {
  id: DetailsTab;
  label: string;
  count?: number;
}
