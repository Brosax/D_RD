/**
 * Types for concurrent multi-agent analysis
 */

import type { Evidence } from '../types.js'

/**
 * Configuration for concurrent analysis mode
 */
export interface ConcurrentAnalysisConfig {
  targetPath: string
  runtimeMinutes: number
  workerCount: number
  crossValidationCount: number
  outputFormat: 'json' | 'markdown'
  outputPath?: string
}

/**
 * A finding returned by a worker agent
 */
export interface WorkerFinding {
  workerId: string
  ruleId: string
  title: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'informational'
  confidence: 'likely' | 'possible' | 'unclear'
  file: string
  line: number
  snippet: string
  description: string
  remediation: string
  category: string
}

/**
 * Result returned by a worker agent after scanning a file
 */
export interface WorkerResult {
  workerId: string
  filePath: string
  scanDurationMs: number
  findings: WorkerFinding[]
  errors: string[]
}

/**
 * Aggregated finding after deduplication from multiple agents
 */
export interface AggregatedFinding {
  uniqueKey: string
  title: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'informational'
  confidence: 'likely' | 'possible' | 'unclear'
  description: string
  evidence: Evidence[]
  reportedBy: string[]
  agentCount: number
  remediation: string
  tags: string[]
}

/**
 * Analysis session state
 */
export interface AnalysisSession {
  sessionId: string
  startTime: Date
  endTime?: Date
  filesTotal: number
  filesScanned: Set<string>
  currentRound: number
  findings: AggregatedFinding[]
}

/**
 * Worker statistics
 */
export interface WorkerStats {
  workerId: string
  filesProcessed: number
  findingsFound: number
  lastActive: Date
}
