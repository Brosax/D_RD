/**
 * JSON exporter for SESIP code analysis results.
 */

import type { CodeAnalysisReport } from '../types.js'

export class JsonExporter {
  export(report: CodeAnalysisReport): string {
    return JSON.stringify(
      {
        scan_id: report.scanId,
        timestamp: report.timestamp,
        target_path: report.targetPath,
        purpose: report.purpose,
        motivation: report.motivation,
        tested_sample: report.testedSample,
        scope: {
          target_path: report.scope.targetPath,
          focus: report.scope.focus,
          discovered_files: report.scope.discoveredFiles,
          included_modules: report.scope.includedModules,
          excluded_modules: report.scope.excludedModules,
          coverage_summary: report.scope.coverageSummary,
        },
        description_of_analysis_method: report.methodDescription,
        results_summary: report.resultsSummary,
        findings: report.validatedFindings.map(finding => ({
          vuln_id: finding.vulnId,
          title: finding.title,
          confidence: finding.revisedConfidence,
          severity: finding.revisedSeverity,
          severity_rationale: finding.severityRationale,
          description: finding.description,
          observed_facts: finding.observedFacts,
          inferences: finding.inferences,
          hypotheses: finding.hypotheses,
          evidence: finding.evidence,
          files_affected: finding.filesAffected,
          attack_scenario: finding.attackScenario,
          impact: finding.impact,
          preconditions: finding.preconditions,
          reproduction: finding.reproduction,
          fix_recommendation: finding.fixRecommendation,
          patch_direction: finding.patchDirection,
          verification: finding.verification,
          tags: finding.tags,
          sesip_control_area: finding.sesipControlArea,
          validation_result: finding.validationResult,
          review_stage: finding.reviewStage,
          module_name: finding.moduleName,
          original_confidence: finding.originalConfidence,
          original_severity: finding.originalSeverity,
          revised_confidence: finding.revisedConfidence,
          revised_severity: finding.revisedSeverity,
          evidence_validated: finding.evidenceValidated,
          failed_assumptions: finding.failedAssumptions,
          reasoning: finding.reasoning,
          recommended_action: finding.recommendedAction,
        })),
        developer_follow_up_items: report.developerFollowUpItems,
      },
      null,
      2
    )
  }
}
