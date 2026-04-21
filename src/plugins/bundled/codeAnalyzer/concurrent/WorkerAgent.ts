/**
 * Worker agent for file analysis
 */

import type { WorkerFinding, WorkerResult } from './types.js'

export class WorkerAgent {
  private workerId: string

  constructor(workerId: string) {
    this.workerId = workerId
  }

  getId(): string {
    return this.workerId
  }

  /**
   * Analyze a single file and return findings
   * Note: Actual analysis logic will be delegated to rule engine and LLM client
   */
  async analyzeFile(filePath: string): Promise<WorkerResult> {
    const startTime = Date.now()
    const findings: WorkerFinding[] = []
    const errors: string[] = []

    try {
      // Import rule engine and LLM client dynamically to avoid circular deps
      const { RuleEngine } = await import('../rules/engine.js')
      const { LocalModelClient } = await import('../llm/localClient.js')
      const { FileParser } = await import('../scanner/fileParser.js')

      const parser = new FileParser()
      const ruleEngine = new RuleEngine()
      const llmClient = new LocalModelClient()

      const content = await parser.parse(filePath)
      if (!content) {
        errors.push(`Failed to parse: ${filePath}`)
        return { workerId: this.workerId, filePath, scanDurationMs: Date.now() - startTime, findings: [], errors }
      }

      // Phase 1: Rule engine scan
      const ruleMatches = ruleEngine.scan(content, filePath)

      // Phase 2: LLM analysis for high confidence matches
      const llmResults = new Map()
      if (ruleMatches.length > 0) {
        const topMatches = ruleMatches.slice(0, 5)
        for (const match of topMatches) {
          const result = await llmClient.analyzeContext(match.snippet, {
            file: filePath,
            rule: match.ruleId,
          })
          if (result) {
            llmResults.set(match.ruleId, result)
          }
        }
      }

      // Convert to WorkerFinding
      for (const match of ruleMatches) {
        const llmResult = llmResults.get(match.ruleId)
        const finding: WorkerFinding = {
          workerId: this.workerId,
          ruleId: match.ruleId,
          title: match.title,
          severity: (llmResult?.severity as WorkerFinding['severity']) ?? match.severity as WorkerFinding['severity'],
          confidence: (llmResult?.confidence as WorkerFinding['confidence']) ?? match.confidence as WorkerFinding['confidence'],
          file: match.file,
          line: match.line,
          snippet: match.snippet,
          description: llmResult?.description ?? match.description,
          remediation: llmResult?.remediation ?? match.remediation,
          category: match.category,
        }
        findings.push(finding)
      }

    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err))
    }

    return {
      workerId: this.workerId,
      filePath,
      scanDurationMs: Date.now() - startTime,
      findings,
      errors,
    }
  }
}