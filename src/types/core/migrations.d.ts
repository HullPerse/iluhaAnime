export interface StoreMigration {
  store: string;
  from: number;
  to: number;
}

export interface TrackedStore {
  store: string;
  current: number;
}
