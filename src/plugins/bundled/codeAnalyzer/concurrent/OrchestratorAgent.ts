/**
 * Orchestrator agent for multi-agent concurrent analysis
 *
 * 状态机模式：OrchestratorAgent 不再直接分析文件，而是维护状态，
 * 提供方法让主 LLM 查询当前状态和获取下一步行动。
 */

import type { AnalysisSession, ConcurrentAnalysisConfig, WorkerResult } from './types.js'
import { CountdownTimer } from './CountdownTimer.js'
import { FileScheduler } from './FileScheduler.js'
import { DedupEngine } from './DedupEngine.js'
import { ReportManager } from './ReportManager.js'
import { WorkerAgent } from './WorkerAgent.js'
import type { AnalysisModelContext } from '../llm/localClient.js'
import { LocalModelClient } from '../llm/localClient.js'

export interface OrchestratorState {
  sessionId: string
  status: 'idle' | 'running' | 'paused' | 'completed'
  currentRound: number
  totalRounds: number
  filesTotal: number
  filesScanned: number
  pendingFiles: string[]
  currentBatch: string[]
  remainingMs: number
  totalMs: number
  findingsCount: number
}

export interface AnalysisInstruction {
  type: 'analyze'
  batch: string[]
  round: number
  workerCount: number
  description: string
}

export interface RoundSummary {
  round: number
  filesAnalyzed: string[]
  findingsCount: number
  durationMs: number
}

export class OrchestratorAgent {
  private config: ConcurrentAnalysisConfig
  private timer: CountdownTimer
  private fileScheduler: FileScheduler
  private dedupEngine: DedupEngine
  private reportManager: ReportManager
  private session: AnalysisSession
  private status: 'idle' | 'running' | 'paused' | 'completed' = 'idle'
  private pendingResults: WorkerResult[] = []
  private modelContext?: AnalysisModelContext
  private llmClient: LocalModelClient
  private static readonly MIN_ROUNDS = 2

  constructor(
    config: ConcurrentAnalysisConfig,
    files: string[],
    modelContext?: AnalysisModelContext,
    llmClient: LocalModelClient = new LocalModelClient()
  ) {
    this.config = config
    this.modelContext = modelContext
    this.llmClient = llmClient
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
        this.status = 'completed'
      },
    })
    this.fileScheduler = new FileScheduler(files, config.workerCount, config.crossValidationCount)
    this.dedupEngine = new DedupEngine()
    this.reportManager = new ReportManager(config.targetPath)
    this.session = {
      sessionId: `session-${Date.now()}`,
      startTime: new Date(),
      filesTotal: files.length,
      filesScanned: new Set(),
      currentRound: 0,
      findings: [],
    }
  }

  /**
   * 启动分析会话
   */
  async start(): Promise<void> {
    await this.reportManager.initialize()
    console.log(`[Report] Created report directory: ${this.reportManager.getBasePath()}`)
    this.timer.start()
    this.status = 'running'
  }

  /**
   * 获取当前状态
   */
  getState(): OrchestratorState {
    const batchSize = this.config.workerCount * this.config.crossValidationCount
    const pendingFiles = this.fileScheduler.getRemainingFiles()

    return {
      sessionId: this.session.sessionId,
      status: this.status,
      currentRound: this.session.currentRound,
      totalRounds: this.session.currentRound + Math.ceil(pendingFiles.length / batchSize),
      filesTotal: this.session.filesTotal,
      filesScanned: this.session.filesScanned.size,
      pendingFiles: pendingFiles.slice(0, 50), // 限制返回数量
      currentBatch: this.fileScheduler.peekBatch(batchSize),
      remainingMs: this.timer.remaining(),
      totalMs: this.timer.getTotalMs(),
      findingsCount: this.dedupEngine.getResults().length,
    }
  }

  /**
   * 获取下一批待分析文件（供主 LLM 调用 AgentTool 使用）
   */
  getNextInstruction(): AnalysisInstruction | null {
    if (this.status !== 'running' && this.status !== 'idle') {
      return null
    }

    if (!this.timer.shouldContinue()) {
      this.status = 'completed'
      return null
    }

    const batchSize = this.config.workerCount * this.config.crossValidationCount
    const batch = this.fileScheduler.nextBatch(batchSize)

    if (batch.length === 0) {
      // 当前批次完成，检查是否可以开启新轮
      const remaining = this.timer.remaining()
      const totalMs = this.timer.getTotalMs()
      const minRoundTime = Math.min(60000, totalMs * 0.1)

      // 已完成最少轮次后，才检查时间
      if (this.session.currentRound >= OrchestratorAgent.MIN_ROUNDS) {
        if (remaining < minRoundTime) {
          this.status = 'completed'
          return null
        }
      }

      // 开始新轮
      if (this.fileScheduler.allConsumed()) {
        this.fileScheduler.reset()
        this.session.currentRound++
        console.log(`Round ${this.session.currentRound} started (min rounds: ${OrchestratorAgent.MIN_ROUNDS})`)
        const newBatch = this.fileScheduler.nextBatch(batchSize)
        return {
          type: 'analyze',
          batch: newBatch,
          round: this.session.currentRound,
          workerCount: this.config.workerCount,
          description: `Round ${this.session.currentRound}: Analyze ${newBatch.length} files with ${this.config.workerCount} workers`,
        }
      }
    }

    return {
      type: 'analyze',
      batch,
      round: this.session.currentRound,
      workerCount: this.config.workerCount,
      description: `Round ${this.session.currentRound}: Analyze ${batch.length} files with ${this.config.workerCount} workers`,
    }
  }

  /**
   * 接收 worker 返回的结果
   */
  async reportResults(results: WorkerResult[]): Promise<void> {
    for (const result of results) {
      await this.processWorkerResult(result)
    }
  }

  /**
   * 判断是否应该继续
   */
  shouldContinue(): boolean {
    if (this.status === 'completed' || this.status === 'idle') {
      return false
    }
    return this.timer.shouldContinue()
  }

  /**
   * 结束会话并生成报告
   */
  async finish(): Promise<string> {
    this.timer.stop()
    this.status = 'completed'
    this.session.endTime = new Date()

    const findings = this.dedupEngine.getResults()
    const reportPath = await this.reportManager.generateReport(findings, {
      filesScanned: this.session.filesScanned.size,
      filesTotal: this.session.filesTotal,
      currentRound: this.session.currentRound,
    })
    console.log(`[Report] Final report generated: ${reportPath}`)

    this.session.findings = findings
    return reportPath
  }

  async run(
    onProgress?: (state: OrchestratorState) => void
  ): Promise<{
    reportPath: string
    findings: ReturnType<OrchestratorAgent['getAggregatedFindings']>
    state: OrchestratorState
  }> {
    await this.start()
    this.session.currentRound = 1
    onProgress?.(this.getState())

    while (this.shouldContinue()) {
      const instruction = this.getNextInstruction()
      if (!instruction || instruction.batch.length === 0) {
        break
      }

      const results = await this.executeBatch(instruction.batch)
      await this.reportResults(results)
      onProgress?.(this.getState())
    }

    const reportPath = await this.finish()
    const findings = this.getAggregatedFindings()
    const state = this.getState()
    onProgress?.(state)

    return { reportPath, findings, state }
  }

  /**
   * 获取已聚合的 findings
   */
  getAggregatedFindings() {
    return this.dedupEngine.getResults()
  }

  /**
   * 获取 ReportManager
   */
  getReportManager(): ReportManager {
    return this.reportManager
  }

  private async processWorkerResult(result: WorkerResult): Promise<void> {
    // Track scanned files
    this.session.filesScanned.add(result.filePath)

    // Write to persistent log
    await this.reportManager.writeWorkerLog(
      result.workerId,
      this.session.currentRound,
      result
    )

    // Add findings to deduplication engine
    for (const finding of result.findings) {
      this.dedupEngine.addFinding(finding)
    }
  }

  getSession(): AnalysisSession {
    return this.session
  }

  private async executeBatch(batch: string[]): Promise<WorkerResult[]> {
    const results = await Promise.all(
      batch.map(async (filePath, index) => {
        const worker = new WorkerAgent(
          `worker-${index % this.config.workerCount}`,
          this.modelContext,
          this.llmClient
        )
        return worker.analyzeFile(filePath)
      })
    )
    this.pendingResults.push(...results)
    return results
  }
}
