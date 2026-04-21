/**
 * Code Analyzer Plugin - Main class.
 */

import type {
  AnalysisConfig,
  AnalysisResult,
  Finding,
  RuleMatch,
} from './types.js'
import { FileDiscovery } from './scanner/fileDiscovery.js'
import { FileParser } from './scanner/fileParser.js'
import { RuleEngine } from './rules/engine.js'
import { LocalModelClient } from './llm/localClient.js'
import { JsonExporter } from './report/jsonExporter.js'
import { HtmlExporter } from './report/htmlExporter.js'
import { OrchestratorAgent } from './concurrent/OrchestratorAgent.js'
import type { ConcurrentAnalysisConfig } from './concurrent/types.js'

export class CodeAnalyzerPlugin {
  private scanner: FileDiscovery
  private parser: FileParser
  private ruleEngine: RuleEngine
  private llmClient: LocalModelClient
  private findings: Finding[]
  private vulnCounter: number

  constructor() {
    this.scanner = new FileDiscovery()
    this.parser = new FileParser()
    this.ruleEngine = new RuleEngine()
    this.llmClient = new LocalModelClient()
    this.findings = []
    this.vulnCounter = 1
  }

  async execute(args: string[], context: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.findings = []
    this.vulnCounter = 1

    // Parse arguments
    const { targetPath, outputFormat, outputPath, runtimeMinutes, workerCount } = this.parseArgs(args)

    if (!targetPath) {
      return {
        status: 'error',
        message: 'Usage: /code-analyzer <path_to_code> [--format json|html] [--output <file>] [--runtime <minutes>] [--workers <count>]',
        actionRequired: 'Ask user to provide code path',
      }
    }

    const discoveredFiles = await this.scanner.scan(targetPath)
    if (!discoveredFiles.length) {
      return {
        status: 'error',
        message: `No C/C++ files found in ${targetPath}`,
        actionRequired: 'Ask user to verify path',
      }
    }

    // Concurrent mode: use OrchestratorAgent
    if (runtimeMinutes && workerCount && workerCount > 0) {
      return this.executeConcurrent(
        targetPath,
        discoveredFiles,
        outputFormat,
        outputPath,
        { runtimeMinutes, workerCount }
      )
    }

    // Single-threaded mode (existing logic)
    return this.executeSingleThreaded(targetPath, discoveredFiles, outputFormat, outputPath)
  }

  private async executeConcurrent(
    targetPath: string,
    discoveredFiles: string[],
    outputFormat: 'json' | 'html',
    outputPath: string | undefined,
    config: { runtimeMinutes: number; workerCount: number }
  ): Promise<Record<string, unknown>> {
    const concurrentConfig: ConcurrentAnalysisConfig = {
      targetPath,
      runtimeMinutes: config.runtimeMinutes,
      workerCount: config.workerCount,
      crossValidationCount: 2, // default
      outputFormat,
      outputPath,
    }

    const orchestrator = new OrchestratorAgent(concurrentConfig, discoveredFiles)
    const session = await orchestrator.run()

    // Convert AggregatedFinding to Finding
    const findings = this.aggregateToFindings(session.findings)
    this.findings = findings

    // Generate summary
    const summary = this.generateSummary()

    const result: AnalysisResult = {
      scanId: session.sessionId,
      timestamp: session.startTime.toISOString(),
      targetPath,
      analysisRounds: [
        { round: 1, tool: 'orchestrator.concurrent', findings: session.filesScanned.size },
      ],
      summary,
      findings,
    }

    if (outputFormat === 'html') {
      const exporter = new HtmlExporter()
      const output = await exporter.export(result, outputPath)
      return { status: 'success', outputFile: outputPath, output, format: 'html' }
    }

    const exporter = new JsonExporter()
    return {
      status: 'success',
      data: JSON.parse(exporter.export(result)),
      format: 'json',
    }
  }

  private aggregateToFindings(aggregatedFindings: import('./concurrent/types.js').AggregatedFinding[]): Finding[] {
    return aggregatedFindings.map((af, index) => ({
      vulnId: `VULN-S1-${String(index + 1).padStart(3, '0')}`,
      title: af.title,
      confidence: af.confidence,
      severity: af.severity,
      severityRationale: `Confirmed by ${af.agentCount} agent(s)`,
      description: af.description,
      evidence: af.evidence,
      filesAffected: [...new Set(af.evidence.map(e => e.file))],
      attackScenario: {},
      impact: {},
      preconditions: [],
      fixRecommendation: af.remediation,
      patchDirection: '',
      verification: {},
      tags: af.tags,
    }))
  }

  private async executeSingleThreaded(
    targetPath: string,
    discoveredFiles: string[],
    outputFormat: 'json' | 'html',
    outputPath: string | undefined
  ): Promise<Record<string, unknown>> {
    const config: AnalysisConfig = { targetPath, outputFormat, outputPath }
    // Phase 1: Rule engine scan (round 1)
    const round1Results: RuleMatch[] = []
    for (const filePath of discoveredFiles) {
      const content = await this.parser.parse(filePath)
      if (content) {
        const matches = this.ruleEngine.scan(content, filePath, config.rules)
        round1Results.push(...matches)
      }
    }

    // Phase 3: LLM deep analysis (round 2) for suspicious findings
    const round2Results: unknown[] = []
    if (round1Results.length > 0) {
      await this.llmClient.checkAvailability()
      for (const match of round1Results.slice(0, 5)) {
        const llmAnalysis = await this.llmClient.analyzeContext(match.snippet, {
          file: match.file,
          rule: match.ruleId,
        })
        if (llmAnalysis) {
          round2Results.push(llmAnalysis as unknown)
        }
      }
    }

    // Convert to Findings
    this.convertToFindings(round1Results, round2Results)

    // Generate summary
    const summary = this.generateSummary()

    // Generate result
    const result: AnalysisResult = {
      scanId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      targetPath,
      analysisRounds: [
        { round: 1, tool: 'rule_engine.scan', findings: round1Results.length },
        { round: 2, tool: 'local_model.analyze_context', findings: round2Results.length },
      ],
      summary,
      findings: this.findings,
    }

    // Export based on format
    if (config.outputFormat === 'json') {
      const exporter = new JsonExporter()
      return {
        status: 'success',
        data: JSON.parse(exporter.export(result)),
        format: 'json',
      }
    } else if (config.outputFormat === 'html') {
      const exporter = new HtmlExporter()
      const output = await exporter.export(result, config.outputPath)
      return {
        status: 'success',
        outputFile: config.outputPath,
        output,
        format: 'html',
      }
    }

    return {
      status: 'error',
      message: `Unsupported format: ${config.outputFormat}`,
    }
  }

  private convertToFindings(
    round1: RuleMatch[],
    round2: unknown[]
  ): void {
    for (const match of round1) {
      const finding: Finding = {
        vulnId: `VULN-S1-${String(this.vulnCounter).padStart(3, '0')}`,
        title: match.title,
        confidence: (match.confidence as Finding['confidence']) ?? 'possible',
        severity: (match.severity as Finding['severity']) ?? 'medium',
        severityRationale: `Detected by rule ${match.ruleId}`,
        description: match.description,
        evidence: [
          {
            file: match.file,
            symbol: '',
            lines: String(match.line),
            snippet: match.snippet,
          },
        ],
        filesAffected: [match.file],
        attackScenario: {},
        impact: {},
        preconditions: [],
        fixRecommendation: match.remediation,
        patchDirection: '',
        verification: {},
        tags: [match.ruleId],
      }
      this.findings.push(finding)
      this.vulnCounter++
    }
  }

  private generateSummary(): AnalysisResult['summary'] {
    const summary: AnalysisResult['summary'] = {
      total: this.findings.length,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      informational: 0,
    }

    for (const f of this.findings) {
      if (f.severity in summary) {
        summary[f.severity]++
      }
    }

    return summary
  }

  private parseArgs(args: string[]): {
    targetPath: string | undefined
    outputFormat: 'json' | 'html'
    outputPath: string | undefined
    runtimeMinutes?: number
    workerCount?: number
  } {
    let targetPath: string | undefined
    let outputFormat: 'json' | 'html' = 'json'
    let outputPath: string | undefined
    let runtimeMinutes: number | undefined
    let workerCount: number | undefined

    for (let i = 0; i < args.length; i++) {
      const arg = args[i]

      if (arg === '--format' && i + 1 < args.length) {
        const format = args[i + 1].toLowerCase()
        if (format === 'json' || format === 'html') {
          outputFormat = format
          i++
        }
      } else if (arg === '--output' && i + 1 < args.length) {
        outputPath = args[i + 1]
        i++
      } else if (arg === '--runtime' && i + 1 < args.length) {
        runtimeMinutes = parseInt(args[i + 1], 10)
        i++
      } else if (arg === '--workers' && i + 1 < args.length) {
        workerCount = parseInt(args[i + 1], 10)
        i++
      } else if (!arg.startsWith('-')) {
        targetPath = arg
      }
    }

    return { targetPath, outputFormat, outputPath, runtimeMinutes, workerCount }
  }
}

// Singleton instance
export const codeAnalyzerPlugin = new CodeAnalyzerPlugin()
