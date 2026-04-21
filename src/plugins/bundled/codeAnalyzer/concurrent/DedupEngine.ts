/**
 * Deduplication engine for findings from multiple agents
 */

import type { AggregatedFinding, WorkerFinding } from './types.js'

export class DedupEngine {
  private primaryIndex = new Map<string, AggregatedFinding>()

  /**
   * Generate unique key for deduplication
   */
  private makeKey(finding: WorkerFinding): string {
    return `${finding.file}:${finding.line}:${finding.ruleId}`
  }

  /**
   * Add a finding from a worker
   * If duplicate (same file:line:ruleId), merge evidence and update
   */
  addFinding(finding: WorkerFinding): void {
    const key = this.makeKey(finding)

    if (this.primaryIndex.has(key)) {
      const existing = this.primaryIndex.get(key)!

      // Update reportedBy (avoid duplicates)
      if (!existing.reportedBy.includes(finding.workerId)) {
        existing.reportedBy.push(finding.workerId)
      }

      // Increment agent count
      existing.agentCount++

      // Merge evidence if not already present
      const newEvidence = {
        file: finding.file,
        lines: String(finding.line),
        snippet: finding.snippet,
      }
      const exists = existing.evidence.some(
        e => e.lines === newEvidence.lines && e.snippet === newEvidence.snippet
      )
      if (!exists) {
        existing.evidence.push(newEvidence)
      }

      // Upgrade confidence if multiple agents confirm likely
      if (finding.confidence === 'likely' && existing.confidence !== 'likely') {
        existing.confidence = 'likely'
      }

      // Merge tags
      for (const tag of [finding.category, finding.ruleId]) {
        if (!existing.tags.includes(tag)) {
          existing.tags.push(tag)
        }
      }

    } else {
      // Create new aggregated finding
      this.primaryIndex.set(key, {
        uniqueKey: key,
        title: finding.title,
        severity: finding.severity,
        confidence: finding.confidence,
        description: finding.description,
        evidence: [{
          file: finding.file,
          lines: String(finding.line),
          snippet: finding.snippet,
        }],
        reportedBy: [finding.workerId],
        agentCount: 1,
        remediation: finding.remediation,
        tags: [finding.category, finding.ruleId],
      })
    }
  }

  /**
   * Get all aggregated findings
   */
  getResults(): AggregatedFinding[] {
    return Array.from(this.primaryIndex.values())
  }

  /**
   * Get count of unique findings
   */
  getCount(): number {
    return this.primaryIndex.size
  }

  /**
   * Get findings by severity
   */
  getBySeverity(severity: string): AggregatedFinding[] {
    return this.getResults().filter(f => f.severity === severity)
  }

  /**
   * Clear all findings
   */
  clear(): void {
    this.primaryIndex.clear()
  }
}