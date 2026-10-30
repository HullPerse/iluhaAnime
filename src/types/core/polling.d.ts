export interface PollingOptions<K> {
  intervalMs: number;
  enabled?: boolean;
  collectKeys: () => readonly K[];
  shouldFetch: (key: K) => boolean;
  fetch: (key: K) => Promise<boolean>;
  onStart?: (key: K) => void;
  onSettle?: (key: K) => void;
}
