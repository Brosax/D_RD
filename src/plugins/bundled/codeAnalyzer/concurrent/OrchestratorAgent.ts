/**
 * Orchestrator agent for multi-agent concurrent analysis
 */

import type { AnalysisSession, ConcurrentAnalysisConfig, WorkerResult } from './types.js'
import { CountdownTimer } from './CountdownTimer.js'
import { FileScheduler } from './FileScheduler.js'
import { ConcurrencyManager } from './ConcurrencyManager.js'
import { DedupEngine } from './DedupEngine.js'
import { WorkerAgent } from './WorkerAgent.js'

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export class OrchestratorAgent {
  private config: ConcurrentAnalysisConfig
  private timer: CountdownTimer
  private fileScheduler: FileScheduler
  private concurrencyManager: ConcurrencyManager
  private dedupEngine: DedupEngine
  private workers: Map<string, WorkerAgent>
  private session: AnalysisSession
  private static readonly MIN_ROUNDS = 2

  constructor(config: ConcurrentAnalysisConfig, files: string[]) {
    this.config = config
    const totalMs = config.runtimeMinutes * 60 * 1000
    this.timer = new CountdownTimer({
      initialMs: totalMs,
      warningThresholdMs: Math.min(60000, totalMs * 0.1),
      onTick: (remaining) => {
        // 可选：更新进度
      },
      onWarning: (remaining) => {
        console.log(`[Warning] Only ${Math.ceil(remaining / 1000)}s remaining`)
      },
      onExpire: () => {
        console.log('[Timer] Time expired')
      },
    })
    this.fileScheduler = new FileScheduler(files, config.workerCount, config.crossValidationCount)
    this.concurrencyManager = new ConcurrencyManager(config.workerCount)
    this.dedupEngine = new DedupEngine()
    this.workers = new Map()

    // Create worker agents
    for (let i = 0; i < config.workerCount; i++) {
      const workerId = `worker-${i}`
      this.workers.set(workerId, new WorkerAgent(workerId))
    }

    this.session = {
      sessionId: `session-${Date.now()}`,
      startTime: new Date(),
      filesTotal: files.length,
      filesScanned: new Set(),
      currentRound: 0,
      findings: [],
    }
  }

  async run(): Promise<AnalysisSession> {
    this.timer.start()

    while (this.timer.shouldContinue()) {
      // Get batch of files to process
      const batchSize = this.config.workerCount * this.config.crossValidationCount
      const batch = this.fileScheduler.nextBatch(batchSize)

      if (batch.length === 0) {
        // 本批次处理完毕，检查是否可以开启新轮次
        const remaining = this.timer.remaining()
        const totalMs = this.timer.getTotalMs()
        const minRoundTime = Math.min(60000, totalMs * 0.1)  // 剩余时间的 10% 或 1 分钟

        // 已完成最少轮次后，才检查时间是否足够开启新轮
        if (this.session.currentRound >= OrchestratorAgent.MIN_ROUNDS) {
          if (remaining < minRoundTime) break
        }

        // 开始新轮
        if (this.fileScheduler.allConsumed()) {
          this.fileScheduler.reset()
          this.session.currentRound++
          console.log(`Round ${this.session.currentRound} started (min rounds: ${OrchestratorAgent.MIN_ROUNDS})`)
        }

        await sleep(100)
        continue
      }

      // Process batch with workers
      await this.processBatch(batch)

      // 检查本轮是否完成
      if (this.fileScheduler.allConsumed()) {
        const remaining = this.timer.remaining()
        const totalMs = this.timer.getTotalMs()
        const minRoundTime = Math.min(60000, totalMs * 0.1)

        // 至少完成 2 轮后才能根据时间退出
        if (this.session.currentRound >= OrchestratorAgent.MIN_ROUNDS && remaining < minRoundTime) {
          break
        }

        // 否则开始新轮
        this.fileScheduler.reset()
        this.session.currentRound++
        console.log(`Round ${this.session.currentRound} started (min rounds: ${OrchestratorAgent.MIN_ROUNDS})`)
      }

      // Brief pause between rounds
      await sleep(100)
    }

    this.timer.stop()
    this.session.endTime = new Date()
    this.session.findings = this.dedupEngine.getResults()

    return this.session
  }

  private async processBatch(files: string[]): Promise<void> {
    const promises = files.map(async (filePath) => {
      await this.concurrencyManager.acquire()

      try {
        // Assign a worker based on file hash for cross-validation
        const assignedWorkers = this.fileScheduler.assignWorkersForFile(filePath)
        const workerId = assignedWorkers[0] // Primary worker
        const worker = this.workers.get(workerId)

        if (!worker) {
          console.error(`Worker not found: ${workerId}`)
          return
        }

        const result = await worker.analyzeFile(filePath)
        this.processWorkerResult(result)

      } finally {
        this.concurrencyManager.release()
      }
    })

    await Promise.all(promises)
  }

  private processWorkerResult(result: WorkerResult): void {
    // Track scanned files
    this.session.filesScanned.add(result.filePath)

    // Add findings to deduplication engine
    for (const finding of result.findings) {
      this.dedupEngine.addFinding(finding)
    }
  }

  getSession(): AnalysisSession {
    return this.session
  }

  getAggregatedFindings() {
    return this.dedupEngine.getResults()
  }
}