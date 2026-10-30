import type { LruCache, LruCacheStats } from "@/types/cache";

export type { LruCache };

interface LruNode<K, V> {
  key: K;
  value: V;
  prev: LruNode<K, V> | null;
  next: LruNode<K, V> | null;
}

export function createLruCache<K, V>(capacity: number): LruCache<K, V> {
  const maxSize = Math.max(1, Math.floor(capacity));
  const map = new Map<K, LruNode<K, V>>();
  // oldest
  let head: LruNode<K, V> | null = null;
  // newest
  let tail: LruNode<K, V> | null = null;
  let size = 0;
  let hits = 0;
  let misses = 0;
  let evictions = 0;

  const detachNode = (node: LruNode<K, V>): void => {
    if (node.prev) node.prev.next = node.next;
    else head = node.next;
    if (node.next) node.next.prev = node.prev;
    else tail = node.prev;
    node.prev = null;
    node.next = null;
  };

  const appendNode = (node: LruNode<K, V>): void => {
    node.prev = tail;
    node.next = null;
    if (tail) tail.next = node;
    else head = node;
    tail = node;
  };

  return {
    get(key: K): V | undefined {
      const node = map.get(key);
      if (!node) {
        misses += 1;
        return undefined;
      }
      detachNode(node);
      appendNode(node);
      hits += 1;
      return node.value;
    },
    peek(key: K): V | undefined {
      return map.get(key)?.value;
    },
    set(key: K, value: V): void {
      const existing = map.get(key);
      if (existing) {
        existing.value = value;
        detachNode(existing);
        appendNode(existing);
        return;
      }
      if (size >= maxSize && head) {
        map.delete(head.key);
        detachNode(head);
        size -= 1;
        evictions += 1;
      }
      const node: LruNode<K, V> = { key, value, prev: null, next: null };
      map.set(key, node);
      appendNode(node);
      size += 1;
    },
    has(key: K): boolean {
      return map.has(key);
    },
    delete(key: K): boolean {
      const node = map.get(key);
      if (!node) return false;
      map.delete(key);
      detachNode(node);
      size -= 1;
      return true;
    },
    clear(): void {
      map.clear();
      head = null;
      tail = null;
      size = 0;
    },
    stats(): LruCacheStats {
      return { capacity: maxSize, size, hits, misses, evictions };
    },
  };
}

export function inflightFetch<V>(
  inflight: Map<string, Promise<V>>,
  key: string,
  start: () => Promise<V>
): Promise<V> {
  const pending = inflight.get(key);
  if (pending) return pending;
  const request = start();
  const cleanup = () => {
    if (inflight.get(key) === request) inflight.delete(key);
  };
  request.then(cleanup).catch(cleanup);
  inflight.set(key, request);
  return request;
}
