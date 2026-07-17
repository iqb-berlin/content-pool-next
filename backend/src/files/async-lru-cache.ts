export type AsyncCacheStatus = "hit" | "miss" | "coalesced";

export interface AsyncCacheResult<V> {
  value: V;
  status: AsyncCacheStatus;
}

interface AsyncCacheEntry<V> {
  promise: Promise<V>;
  settled: boolean;
}

export class AsyncLruCache<K, V> {
  private readonly entries = new Map<K, AsyncCacheEntry<V>>();

  constructor(private readonly maxEntries: number) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1) {
      throw new RangeError("maxEntries must be a positive integer");
    }
  }

  get size(): number {
    return this.entries.size;
  }

  async getOrLoad(
    key: K,
    load: () => Promise<V> | V,
    options: {
      shouldCache?: (value: V) => boolean;
    } = {},
  ): Promise<AsyncCacheResult<V>> {
    const cached = this.entries.get(key);
    if (cached) {
      this.touch(key, cached);
      const status = cached.settled ? "hit" : "coalesced";
      return { value: await cached.promise, status };
    }

    const entry: AsyncCacheEntry<V> = {
      settled: false,
      promise: Promise.resolve(undefined as V),
    };
    entry.promise = Promise.resolve()
      .then(load)
      .then((value) => {
        if (options.shouldCache?.(value) === false) {
          this.deleteIfCurrent(key, entry);
        } else {
          entry.settled = true;
        }
        return value;
      })
      .catch((error) => {
        this.deleteIfCurrent(key, entry);
        throw error;
      });

    this.entries.set(key, entry);
    this.evictOverflow();
    return { value: await entry.promise, status: "miss" };
  }

  delete(key: K): boolean {
    return this.entries.delete(key);
  }

  deleteWhere(predicate: (key: K) => boolean): void {
    for (const key of this.entries.keys()) {
      if (predicate(key)) {
        this.entries.delete(key);
      }
    }
  }

  clear(): void {
    this.entries.clear();
  }

  private touch(key: K, entry: AsyncCacheEntry<V>): void {
    this.entries.delete(key);
    this.entries.set(key, entry);
  }

  private evictOverflow(): void {
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }

  private deleteIfCurrent(key: K, entry: AsyncCacheEntry<V>): void {
    if (this.entries.get(key) === entry) {
      this.entries.delete(key);
    }
  }
}
