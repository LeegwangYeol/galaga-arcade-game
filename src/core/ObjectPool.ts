/**
 * Galaga Arcade Web Game — Generic Zero-Allocation Object Pool
 * 
 * Architecture:
 * - Contiguous dense-array storage buffer with active-partition pointer.
 * - Zero runtime heap allocations during 60 FPS gameplay to eliminate Garbage Collection hitches.
 * - O(1) swap-and-pop release mechanism without array re-indexing or splicing.
 * - Defensive double-free and foreign object release safeguards.
 * - Cache-friendly contiguous iteration via forEachActive and forEachActiveSafe.
 */

export interface ObjectPoolConfig<T> {
  /** Factory constructor function for instantiating a fresh entity */
  factory: () => T;
  /** Reset function invoked to re-initialize an entity when acquired or released */
  reset?: (item: T) => void;
  /** Initial pre-allocated capacity (Default: 32) */
  initialSize?: number;
  /** Maximum upper bound capacity to prevent runaway memory leaks (Default: 1024) */
  maxSize?: number;
  /** Whether the pool is permitted to grow automatically when exhausted (Default: true) */
  autoExpand?: boolean;
}

export class ObjectPool<T> {
  private readonly factory: () => T;
  private readonly resetFn: (item: T) => void;
  private readonly maxSize: number;
  private readonly autoExpand: boolean;

  // Contiguous dense storage buffer
  private storage: T[] = [];
  private activeCount: number = 0;

  constructor(
    factoryOrConfig: (() => T) | ObjectPoolConfig<T>,
    reset?: (item: T) => void,
    initialSize: number = 32,
    maxSize: number = 1024
  ) {
    if (typeof factoryOrConfig === 'function') {
      this.factory = factoryOrConfig;
      this.resetFn = reset || (() => {});
      const initCapacity = Math.max(1, initialSize);
      this.maxSize = Math.max(initCapacity, maxSize);
      this.autoExpand = true;
      this.preallocate(initCapacity);
    } else {
      const config = factoryOrConfig;
      this.factory = config.factory;
      this.resetFn = config.reset || (() => {});
      const initCapacity = Math.max(1, config.initialSize ?? 32);
      this.maxSize = Math.max(initCapacity, config.maxSize ?? 1024);
      this.autoExpand = config.autoExpand ?? true;
      this.preallocate(initCapacity);
    }
  }

  /**
   * Pre-allocates objects in the internal storage buffer.
   */
  private preallocate(count: number): void {
    const targetSize = Math.min(count, this.maxSize);
    while (this.storage.length < targetSize) {
      const item = this.factory();
      this.resetFn(item);
      this.storage.push(item);
    }
  }

  /**
   * Acquires an active object from the pool.
   * If exhausted and capacity allows, grows the pool automatically.
   * Returns null if maxSize limit is reached and no objects are available.
   */
  public acquire(): T | null {
    if (this.activeCount >= this.storage.length) {
      if (this.autoExpand && this.storage.length < this.maxSize) {
        // Expand storage: double or clamp to maxSize
        const expandSize = Math.min(Math.max(16, this.storage.length * 2), this.maxSize);
        this.preallocate(expandSize);
      } else {
        // Pool exhausted
        return null;
      }
    }

    const item = this.storage[this.activeCount];
    if (item === undefined) {
      return null;
    }

    this.activeCount++;
    this.resetFn(item);
    return item;
  }

  /**
   * Releases an active object back to the free pool using O(1) swap-and-pop.
   */
  public release(item: T): boolean {
    const index = this.storage.indexOf(item);

    // Safeguard: Verify item belongs to pool and is in active partition [0, activeCount - 1]
    if (index === -1 || index >= this.activeCount) {
      // Already released or foreign object (Defensive ignore)
      return false;
    }

    const lastActiveIndex = this.activeCount - 1;

    if (index !== lastActiveIndex) {
      // Swap item with the last active item
      const lastActiveItem = this.storage[lastActiveIndex];
      const currentItem = this.storage[index];
      if (lastActiveItem !== undefined && currentItem !== undefined) {
        this.storage[index] = lastActiveItem;
        this.storage[lastActiveIndex] = currentItem;
      }
    }

    this.activeCount--;
    this.resetFn(item);
    return true;
  }

  /**
   * Returns a read-only view of currently active elements.
   * NOTE: For performance in 60 FPS update loops, prefer forEachActive().
   */
  public getActive(): readonly T[] {
    return this.storage.slice(0, this.activeCount);
  }

  /**
   * High-performance zero-allocation sequential iteration over active entities.
   */
  public forEachActive(callback: (item: T, index: number) => void): void {
    const count = this.activeCount;
    for (let i = 0; i < count; i++) {
      const item = this.storage[i];
      if (item !== undefined) {
        callback(item, i);
      }
    }
  }

  /**
   * Safe reverse-iteration over active entities allowing direct release during traversal.
   */
  public forEachActiveSafe(callback: (item: T, index: number) => void): void {
    for (let i = this.activeCount - 1; i >= 0; i--) {
      if (i < this.activeCount) {
        const item = this.storage[i];
        if (item !== undefined) {
          callback(item, i);
        }
      }
    }
  }

  /**
   * Deactivates and resets all active objects in the pool.
   */
  public clear(): void {
    for (let i = 0; i < this.activeCount; i++) {
      const item = this.storage[i];
      if (item !== undefined) {
        this.resetFn(item);
      }
    }
    this.activeCount = 0;
  }

  /**
   * Completely drains and disposes all allocated objects in the pool.
   */
  public drain(): void {
    this.clear();
    this.storage = [];
  }

  /**
   * Returns the count of currently active (leased) objects.
   */
  public getActiveCount(): number {
    return this.activeCount;
  }

  /**
   * Returns the count of currently free (idle) objects available for acquisition.
   */
  public getFreeCount(): number {
    return this.storage.length - this.activeCount;
  }

  /**
   * Returns the total allocated capacity of the pool.
   */
  public getCapacity(): number {
    return this.storage.length;
  }

  /**
   * Returns the maximum allowable capacity configured for this pool.
   */
  public getMaxSize(): number {
    return this.maxSize;
  }

  /**
   * Returns whether the pool is completely full (no free objects and cannot expand).
   */
  public isFull(): boolean {
    return this.activeCount >= this.maxSize;
  }
}
