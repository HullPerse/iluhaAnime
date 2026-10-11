type ReadyListener = () => void;

let cacheReady = false;
const listeners = new Set<ReadyListener>();

export function isCacheReady(): boolean {
  return cacheReady;
}

export function markCacheReady(): void {
  if (cacheReady) return;
  cacheReady = true;
  for (const listener of listeners) {
    listener();
  }
  listeners.clear();
}

export function awaitCacheReady(timeoutMs: number): Promise<boolean> {
  if (cacheReady) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(
      () => {
        listeners.delete(done);
        resolve(false);
      },
      Math.max(0, timeoutMs)
    );
    const done = () => {
      clearTimeout(timer);
      listeners.delete(done);
      resolve(true);
    };
    listeners.add(done);
  });
}

export function resetSplashSignals(): void {
  cacheReady = false;
  listeners.clear();
  spellingReady = false;
  spellingListeners.clear();
  indexReady = false;
  indexListeners.clear();
}

type WarmListener = () => void;

let spellingReady = false;
const spellingListeners = new Set<WarmListener>();

let indexReady = false;
const indexListeners = new Set<WarmListener>();

export function isSpellingReady(): boolean {
  return spellingReady;
}

export function markSpellingReady(): void {
  if (spellingReady) return;
  spellingReady = true;
  for (const listener of spellingListeners) {
    listener();
  }
  spellingListeners.clear();
}

export function onSpellingReady(listener: WarmListener): () => void {
  spellingListeners.add(listener);
  return () => {
    spellingListeners.delete(listener);
  };
}

export function isIndexReady(): boolean {
  return indexReady;
}

export function markIndexReady(): void {
  if (indexReady) return;
  indexReady = true;
  for (const listener of indexListeners) {
    listener();
  }
  indexListeners.clear();
}

export function onIndexReady(listener: WarmListener): () => void {
  indexListeners.add(listener);
  return () => {
    indexListeners.delete(listener);
  };
}

export function awaitSignal(
  isReady: () => boolean,
  subscribe: (listener: () => void) => () => void,
  timeoutMs: number
): Promise<boolean> {
  if (isReady()) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(
      () => {
        stop();
        resolve(false);
      },
      Math.max(0, timeoutMs)
    );
    const stop = subscribe(() => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}
