/**
 * Orchestrator agent for multi-agent concurrent analysis
 */

import type { AnalysisSession, ConcurrentAnalysisConfig, WorkerResult } from './types.js'
import { TimeController } from './TimeController.js'
import { FileScheduler } from './FileScheduler.js'
import { ConcurrencyManager } from './ConcurrencyManager.js'
import { DedupEngine } from './DedupEngine.js'
import { WorkerAgent } from './WorkerAgent.js'

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export class OrchestratorAgent {
  private config: ConcurrentAnalysisConfig
  private timeController: TimeController
  private fileScheduler: FileScheduler
  private concurrencyManager: ConcurrencyManager
  private dedupEngine: DedupEngine
  private workers: Map<string, WorkerAgent>
  private session: AnalysisSession

  constructor(config: ConcurrentAnalysisConfig, files: string[]) {
    this.config = config
    this.timeController = new TimeController(config.runtimeMinutes)
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
    this.timeController.start()

    while (this.timeController.shouldContinue()) {
      const remainingFiles = this.fileScheduler.getRemaining()

      if (remainingFiles.length === 0) {
        // All files scanned in this round - reset if time allows
        const remaining = this.timeController.remainingMs()
        if (remaining < 60000) break // Less than 1 minute left
        this.fileScheduler.reset()
        this.session.currentRound++
        continue
      }

      // Get batch of files to process
      const batchSize = this.config.workerCount * this.config.crossValidationCount
      const batch = this.fileScheduler.nextBatch(batchSize)

      if (batch.length === 0) {
        await sleep(100)
        continue
      }

      // Process batch with workers
      await this.processBatch(batch)

      // Brief pause between rounds
      await sleep(100)
    }

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