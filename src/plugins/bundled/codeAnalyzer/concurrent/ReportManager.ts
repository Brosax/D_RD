/**
 * Report manager for persisting scan data and generating final reports
 */

import { mkdir, readdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import type { AggregatedFinding, WorkerResult } from './types.js'

export class ReportManager {
  private basePath: string
  private logPath: string
  private sessionId: string

  constructor(targetPath: string) {
    this.sessionId = `scan_${Date.now()}`
    this.basePath = join(targetPath, `report_${this.sessionId}`)
    this.logPath = join(this.basePath, 'log')
  }

  async initialize(): Promise<void> {
    await mkdir(this.logPath, { recursive: true })
  }

  getSessionId(): string {
    return this.sessionId
  }

  getBasePath(): string {
    return this.basePath
  }

  getLogPath(): string {
    return this.logPath
  }

  async writeWorkerLog(
    workerId: string,
    round: number,
    data: WorkerResult
  ): Promise<string> {
    const filename = `worker_${workerId}_round${round}_${Date.now()}.json`
    const filepath = join(this.logPath, filename)
    await writeFile(filepath, JSON.stringify(data, null, 2))
    return filepath
  }

  async readAllWorkerLogs(): Promise<WorkerResult[]> {
    const files = await readdir(this.logPath)
    const jsonFiles = files.filter(f => f.endsWith('.json'))
    const results: WorkerResult[] = []

    for (const file of jsonFiles) {
      try {
        const content = await readFile(join(this.logPath, file), 'utf-8')
        results.push(JSON.parse(content) as WorkerResult)
      } catch {
        // Skip malformed files
      }
    }

    return results
  }

  async generateReport(
    findings: AggregatedFinding[],
    metadata?: Record<string, unknown>
  ): Promise<string> {
    const summary = this.computeSummary(findings)

    const report = {
      scanId: this.sessionId,
      timestamp: new Date().toISOString(),
      basePath: this.basePath,
      logPath: this.logPath,
      summary,
      findings,
      metadata,
    }

    const reportPath = join(this.basePath, 'report.json')
    await writeFile(reportPath, JSON.stringify(report, null, 2))
    return reportPath
  }

  private computeSummary(
    findings: AggregatedFinding[]
  ): Record<string, number> {
    const summary: Record<string, number> = {
      total: findings.length,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      informational: 0,
    }

    for (const f of findings) {
      const severity = f.severity.toLowerCase() as keyof typeof summary
      if (severity in summary) {
        summary[severity]++
      }
    }

    return summary
  }
}
