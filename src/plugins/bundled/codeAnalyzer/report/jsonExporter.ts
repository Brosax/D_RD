/**
 * JSON exporter for analysis results.
 */

import type { AnalysisResult, Finding } from '../types.js'

export class JsonExporter {
  export(result: AnalysisResult): string {
    const data = {
      scan_id: result.scanId,
      timestamp: result.timestamp,
      target_path: result.targetPath,
      analysis_rounds: result.analysisRounds,
      summary: result.summary,
      findings: result.findings.map((f: Finding) => ({
        vuln_id: f.vulnId,
        title: f.title,
        confidence: f.confidence,
        severity: f.severity,
        severity_rationale: f.severityRationale,
        description: f.description,
        evidence: f.evidence,
        files_affected: f.filesAffected,
        attack_scenario: f.attackScenario,
        impact: f.impact,
        preconditions: f.preconditions,
        fix_recommendation: f.fixRecommendation,
        patch_direction: f.patchDirection,
        verification: f.verification,
        tags: f.tags,
      })),
    }

    return JSON.stringify(data, null, 2)
  }
}
