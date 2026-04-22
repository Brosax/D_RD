/**
 * Countdown timer with pause/resume, callbacks, and dynamic adjustment.
 * Adapted from cronScheduler patterns for plugin use.
 */

export type CountdownTimerOptions = {
  /** 初始倒计时（毫秒） */
  initialMs: number
  /** 每秒回调（可选），传入剩余时间 */
  onTick?: (remainingMs: number) => void
  /** 时间耗尽回调 */
  onExpire?: () => void
  /** 时间警告阈值（毫秒），当剩余时间低于此值时触发 onWarning */
  warningThresholdMs?: number
  /** 警告回调 */
  onWarning?: (remainingMs: number) => void
}

export class CountdownTimer {
  private remainingMs: number
  private intervalId: ReturnType<typeof setInterval> | null = null
  private isPaused: boolean = false
  private options: CountdownTimerOptions
  private warningFired: boolean = false

  constructor(options: CountdownTimerOptions) {
    this.remainingMs = options.initialMs
    this.options = options
  }

  /** 启动倒计时 */
  start(): void {
    if (this.intervalId !== null) return

    this.intervalId = setInterval(() => {
      if (this.isPaused) return

      this.remainingMs -= 1000

      if (this.remainingMs < 0) {
        this.remainingMs = 0
      }

      // Tick callback
      this.options.onTick?.(this.remainingMs)

      // Warning threshold check
      if (
        this.options.warningThresholdMs !== undefined &&
        !this.warningFired &&
        this.remainingMs <= this.options.warningThresholdMs
      ) {
        this.warningFired = true
        this.options.onWarning?.(this.remainingMs)
      }

      // Expire check
      if (this.remainingMs <= 0) {
        this.stop()
        this.options.onExpire?.()
      }
    }, 1000)
  }

  /** 暂停倒计时 */
  pause(): void {
    this.isPaused = true
  }

  /** 恢复倒计时 */
  resume(): void {
    this.isPaused = false
  }

  /** 停止倒计时 */
  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  /** 剩余时间（毫秒） */
  remaining(): number {
    return this.remainingMs
  }

  /** 剩余秒数（取整） */
  remainingSeconds(): number {
    return Math.ceil(this.remainingMs / 1000)
  }

  /** 是否仍在运行（未停止且未耗尽） */
  isRunning(): boolean {
    return this.intervalId !== null && this.remainingMs > 0
  }

  /** 是否已耗尽 */
  isExpired(): boolean {
    return this.remainingMs <= 0
  }

  /** 是否已暂停 */
  isPausedState(): boolean {
    return this.isPaused
  }

  /** 动态调整剩余时间（增加或减少） */
  adjust(deltaMs: number): void {
    this.remainingMs += deltaMs
    if (this.remainingMs < 0) {
      this.remainingMs = 0
    }
    // Reset warning flag if we added time
    if (deltaMs > 0 && this.options.warningThresholdMs !== undefined) {
      if (this.remainingMs > this.options.warningThresholdMs) {
        this.warningFired = false
      }
    }
  }

  /** 设置新的剩余时间（重置） */
  reset(newMs: number): void {
    this.remainingMs = newMs
    this.warningFired = false
  }

  /** 是否应该继续（可用于循环条件） */
  shouldContinue(): boolean {
    return this.isRunning() && !this.isExpired()
  }

  /** 获取总时间（用于计算比例） */
  getTotalMs(): number {
    return this.options.initialMs
  }

  /** 获取已用时间 */
  getElapsedMs(): number {
    return this.getTotalMs() - this.remainingMs
  }

  /** 获取进度（0-1） */
  getProgress(): number {
    const total = this.getTotalMs()
    if (total === 0) return 1
    return 1 - this.remainingMs / total
  }
}
