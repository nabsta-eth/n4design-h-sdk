export const CACHE_DURATION_INFINITE = -1;

class CachedObject<T> {
  private value?: T;
  /// The cache duration. CACHE_DURATION_INFINITE for infinite duration.
  private readonly duration: number;
  private lastFetchedTime: number = 0;

  constructor(duration: number) {
    this.duration = duration;
  }

  private get isExpired() {
    return (
      Date.now() > this.lastFetchedTime + this.duration &&
      this.duration !== CACHE_DURATION_INFINITE
    );
  }

  public get isAvailable() {
    return !!this.value && !this.isExpired;
  }

  public async fetch(
    fetcher: () => Promise<T>,
    forceFetch = false
  ): Promise<T> {
    if (!forceFetch && !this.isExpired && !!this.value) {
      return this.value;
    }
    // Update the value.
    this.value = await fetcher();
    this.lastFetchedTime = Date.now();
    return this.value;
  }

  /// Returns cached value, even if expired; throws if empty.
  public get(): T {
    if (!this.value) throw new Error("CachedObject: unavailable");
    return this.value;
  }
}

export { CachedObject };
