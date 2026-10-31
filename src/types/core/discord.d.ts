export interface DiscordButton {
  label: string;
  url: string;
}

export interface DiscordActivity {
  details?: string;
  state?: string;
  startTimestamp?: number;
  endTimestamp?: number;
  activityType?: number;
  buttons?: DiscordButton[];
}

export type DiscordPresenceSource = "main" | "player";

export interface DiscordPresenceDetail {
  id: number;
  title: string;
}
