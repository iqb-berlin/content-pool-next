import { AsyncLruCache } from "./async-lru-cache";

describe("AsyncLruCache", () => {
  it("distinguishes misses, coalesced loads, and settled hits", async () => {
    let release!: (value: string) => void;
    const load = jest.fn(
      () =>
        new Promise<string>((resolve) => {
          release = resolve;
        }),
    );
    const cache = new AsyncLruCache<string, string>(2);

    const first = cache.getOrLoad("key", load);
    const second = cache.getOrLoad("key", load);
    await Promise.resolve();
    release("value");

    await expect(first).resolves.toEqual({ value: "value", status: "miss" });
    await expect(second).resolves.toEqual({
      value: "value",
      status: "coalesced",
    });
    await expect(cache.getOrLoad("key", load)).resolves.toEqual({
      value: "value",
      status: "hit",
    });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("evicts the least recently used entry", async () => {
    const cache = new AsyncLruCache<string, string>(2);

    await cache.getOrLoad("first", () => "first");
    await cache.getOrLoad("second", () => "second");
    await cache.getOrLoad("first", () => "unused");
    await cache.getOrLoad("third", () => "third");

    await expect(cache.getOrLoad("first", () => "unused")).resolves.toEqual({
      value: "first",
      status: "hit",
    });
    await expect(cache.getOrLoad("second", () => "reloaded")).resolves.toEqual({
      value: "reloaded",
      status: "miss",
    });
  });

  it("removes rejected and explicitly non-cacheable loads", async () => {
    const cache = new AsyncLruCache<string, string>(2);

    await expect(
      cache.getOrLoad("rejected", () => Promise.reject(new Error("failed"))),
    ).rejects.toThrow("failed");
    await cache.getOrLoad("temporary", () => "partial", {
      shouldCache: () => false,
    });

    expect(cache.size).toBe(0);
    await expect(
      cache.getOrLoad("rejected", () => "recovered"),
    ).resolves.toEqual({ value: "recovered", status: "miss" });
    await expect(
      cache.getOrLoad("temporary", () => "complete"),
    ).resolves.toEqual({ value: "complete", status: "miss" });
  });

  it("does not let an evicted rejection remove a replacement", async () => {
    let rejectStale!: (error: Error) => void;
    const cache = new AsyncLruCache<string, string>(1);
    const stale = cache.getOrLoad(
      "shared",
      () =>
        new Promise<string>((_resolve, reject) => {
          rejectStale = reject;
        }),
    );
    await Promise.resolve();

    cache.delete("shared");
    await cache.getOrLoad("shared", () => "replacement");
    rejectStale(new Error("stale request failed"));

    await expect(stale).rejects.toThrow("stale request failed");
    await expect(cache.getOrLoad("shared", () => "unused")).resolves.toEqual({
      value: "replacement",
      status: "hit",
    });
  });
});
