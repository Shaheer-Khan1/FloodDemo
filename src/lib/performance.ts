/**
 * Performance Monitoring Utilities
 * Helpers for tracking and optimizing app performance
 */

/**
 * Measure function execution time
 * @param fn Function to measure
 * @param label Label for console output
 */
export async function measurePerformance<T>(
  fn: () => T | Promise<T>,
  label: string
): Promise<T> {
  const start = performance.now();
  
  try {
    const result = await fn();
    const end = performance.now();
    const duration = end - start;
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`⚡ ${label}: ${duration.toFixed(2)}ms`);
    }
    
    return result;
  } catch (error) {
    const end = performance.now();
    const duration = end - start;
    
    if (process.env.NODE_ENV === 'development') {
      console.error(`❌ ${label} failed after ${duration.toFixed(2)}ms`, error);
    }
    
    throw error;
  }
}

/**
 * Log component render time
 * Use in useEffect to track render performance
 */
export function logRenderTime(componentName: string) {
  if (process.env.NODE_ENV === 'development') {
    const start = performance.now();
    
    return () => {
      const end = performance.now();
      const duration = end - start;
      
      if (duration > 16) { // Flag slow renders (>16ms = <60fps)
        console.warn(`🐢 Slow render: ${componentName} took ${duration.toFixed(2)}ms`);
      }
    };
  }
  
  return () => {};
}

/**
 * Throttle function calls
 * Limits function execution to once per interval
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  
  return function(this: any, ...args: Parameters<T>) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Debounce function calls
 * Delays function execution until after delay period
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  
  return function(this: any, ...args: Parameters<T>) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}

/**
 * Batch async operations
 * Executes promises in batches to prevent overwhelming the system
 */
export async function batchAsync<T, R>(
  items: T[],
  operation: (item: T) => Promise<R>,
  batchSize: number = 10,
  delayBetweenBatches: number = 0
): Promise<R[]> {
  const results: R[] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(operation));
    results.push(...batchResults);
    
    // Optional delay between batches
    if (delayBetweenBatches > 0 && i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
    }
  }
  
  return results;
}

/**
 * Retry failed operations with exponential backoff
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      if (i < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, i); // Exponential backoff
        console.log(`Retry ${i + 1}/${maxRetries} after ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError!;
}

/**
 * Memory-safe map implementation
 * Automatically cleans up old entries
 */
export class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;
  
  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
  }
  
  get(key: K): V | undefined {
    const value = this.cache.get(key);
    
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    
    return value;
  }
  
  set(key: K, value: V): void {
    // Remove if exists
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    
    // Add to end
    this.cache.set(key, value);
    
    // Remove oldest if over size
    if (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
  }
  
  clear(): void {
    this.cache.clear();
  }
  
  get size(): number {
    return this.cache.size;
  }
}

/**
 * Check if user is on slow connection
 */
export function isSlowConnection(): boolean {
  if ('connection' in navigator) {
    const conn = (navigator as any).connection;
    return conn?.effectiveType === 'slow-2g' || conn?.effectiveType === '2g';
  }
  return false;
}

/**
 * Prefetch data for next route
 * Call this when user hovers over navigation links
 */
export function prefetchRoute(path: string): void {
  // This would integrate with your router
  // For wouter, you might need to implement custom prefetching
  console.log(`Prefetching route: ${path}`);
}

