/**
 * Time controller for bounded analysis execution
 */

export class TimeController {
  private readonly runtimeMs: number
  private startTime: number = 0

  constructor(runtimeMinutes: number) {
    this.runtimeMs = runtimeMinutes * 60 * 1000
  }

  start(): void {
    this.startTime = Date.now()
  }

  shouldContinue(): boolean {
    return (Date.now() - this.startTime) < this.runtimeMs
  }

  remainingMs(): number {
    return Math.max(0, this.runtimeMs - (Date.now() - this.startTime))
  }

  getElapsedMs(): number {
    return Date.now() - this.startTime
  }

  getTotalMs(): number {
    return this.runtimeMs
  }
}