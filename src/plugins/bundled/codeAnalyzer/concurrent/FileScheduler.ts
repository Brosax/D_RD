/**
 * File scheduler with round-robin and cross-validation support
 */

export class FileScheduler {
  private files: string[]
  private index: number = 0
  private readonly crossValidationCount: number
  private readonly workerCount: number

  constructor(files: string[], workerCount: number, crossValidationCount: number) {
    this.files = [...new Set(files)] // deduplicate
    this.workerCount = workerCount
    this.crossValidationCount = crossValidationCount
    // Shuffle for even distribution
    this.shuffle()
  }

  reset(): void {
    this.index = 0
    this.shuffle()
  }

  getRemaining(): string[] {
    return this.files.slice(this.index)
  }

  nextBatch(batchSize: number): string[] {
    if (this.index >= this.files.length) {
      return []
    }

    const end = Math.min(this.index + batchSize, this.files.length)
    const batch = this.files.slice(this.index, end)
    this.index = end
    return batch
  }

  allConsumed(): boolean {
    return this.index >= this.files.length
  }

  getTotal(): number {
    return this.files.length
  }

  /**
   * Assign workers to a file for cross-validation
   * Uses deterministic hash-based assignment
   */
  assignWorkersForFile(filePath: string): string[] {
    const baseHash = this.hashString(filePath)
    const workers: string[] = []

    for (let i = 0; i < this.crossValidationCount; i++) {
      const workerIndex = (baseHash + i) % this.workerCount
      workers.push(`worker-${workerIndex}`)
    }

    return workers
  }

  private shuffle(): void {
    for (let i = this.files.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.files[i], this.files[j]] = [this.files[j], this.files[i]]
    }
  }

  private hashString(str: string): number {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32bit integer
    }
    return Math.abs(hash)
  }
}