/**
 * Semaphore-based concurrency manager
 */

export class ConcurrencyManager {
  private activeWorkers: number = 0
  private readonly maxConcurrent: number
  private waitQueue: Array<() => void> = []

  constructor(maxConcurrent: number) {
    this.maxConcurrent = maxConcurrent
  }

  async acquire(): Promise<void> {
    if (this.activeWorkers < this.maxConcurrent) {
      this.activeWorkers++
      return
    }

    return new Promise<void>((resolve) => {
      this.waitQueue.push(() => {
        this.activeWorkers++
        resolve()
      })
    })
  }

  release(): void {
    this.activeWorkers--
    const next = this.waitQueue.shift()
    if (next) {
      // Don't increment here - the waiter will increment when it runs
      setImmediate(next)
    }
  }

  getActiveCount(): number {
    return this.activeWorkers
  }

  getWaitingCount(): number {
    return this.waitQueue.length
  }
}