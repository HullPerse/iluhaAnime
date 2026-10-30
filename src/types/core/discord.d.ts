export interface DiscordButton {
  label: string;
  url: string;
}

export interface DiscordActivity {
  details?: string;
  state?: string;
  /** Unix time in milliseconds. */
  startTimestamp?: number;
  endTimestamp?: number;
  /** 0 playing, 2 listening, 3 watching, 5 competing. */
  activityType?: number;
  buttons?: DiscordButton[];
}

export type DiscordPresenceSource = "main" | "player";

export interface DiscordPresenceDetail {
  id: number;
  title: string;
}
