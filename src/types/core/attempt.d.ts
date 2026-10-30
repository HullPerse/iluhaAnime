export interface AttemptAllOptions {
  onFinally?: () => unknown;
}

export interface RetryOptions {
  attempts?: number;
  delay?: number;
  backoff?: number;
  maxDelay?: number;
  signal?: AbortSignal;
  shouldRetry?: (error: Error, attempt: number) => boolean;
}
