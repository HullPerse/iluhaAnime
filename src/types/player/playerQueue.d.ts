export interface QueueDepthStep {
  key: string;
  label: string;
  detail: string;
  done: boolean;
  active: boolean;
  percent: number;
}
