/**
 * Markdown exporter for SESIP code analysis reports.
 */

import { writeFile } from 'fs/promises'
import type { CodeAnalysisReport, ValidatedFinding } from '../types.js'

export class MarkdownExporter {
  async export(report: CodeAnalysisReport, outputPath?: string): Promise<string> {
    const content = this.render(report)
    if (outputPath) {
      await writeFile(outputPath, content, 'utf-8')
    }
    return content
  }

  render(report: CodeAnalysisReport): string {
    const lines: string[] = []
    lines.push('# SESIP Code Analysis Report')
    lines.push('')
    lines.push(`- Scan ID: ${report.scanId}`)
    lines.push(`- Timestamp: ${report.timestamp}`)
    lines.push(`- Target Path: ${report.targetPath}`)
    lines.push('')
    lines.push('## Purpose / Motivation')
    lines.push('')
    lines.push(report.purpose)
    lines.push('')
    lines.push(report.motivation)
    lines.push('')
    lines.push('## Tested Sample')
    lines.push('')
    lines.push(report.testedSample)
    lines.push('')
    lines.push('## Scope and Coverage')
    lines.push('')
    lines.push(`- Focus: ${report.scope.focus}`)
    lines.push(`- Discovered files: ${report.scope.discoveredFiles.length}`)
    lines.push(`- Included modules: ${report.scope.includedModules.length}`)
    lines.push(`- Excluded modules: ${report.scope.excludedModules.length}`)
    lines.push(`- Coverage summary: ${report.scope.coverageSummary}`)
    lines.push('')
    lines.push('Included modules:')
    for (const unit of report.scope.includedModules) {
      lines.push(
        `- ${unit.moduleName}: ${unit.rationale} | controls=${unit.controlAreas.join(', ') || 'not_visible'} | files=${unit.files.length}`
      )
    }
    lines.push('')
    lines.push('Excluded modules:')
    for (const unit of report.scope.excludedModules) {
      lines.push(`- ${unit.moduleName}: ${unit.reason}`)
    }
    lines.push('')
    lines.push('## Description of Analysis Method')
    lines.push('')
    for (const step of report.methodDescription) {
      lines.push(`- ${step}`)
    }
    lines.push('')
    lines.push('## Results Summary')
    lines.push('')
    lines.push(`- Initial findings: ${report.resultsSummary.totalInitial}`)
    lines.push(`- Validated findings: ${report.resultsSummary.totalValidated}`)
    lines.push(`- Confirmed: ${report.resultsSummary.confirmed}`)
    lines.push(`- Partially supported: ${report.resultsSummary.partiallySupported}`)
    lines.push(`- False positive: ${report.resultsSummary.falsePositive}`)
    lines.push(`- Hallucination: ${report.resultsSummary.hallucination}`)
    lines.push(`- High priority items: ${report.resultsSummary.critical + report.resultsSummary.high}`)
    lines.push('')
    lines.push('## Findings by Severity')
    lines.push('')
    lines.push(this.renderSeveritySection(report.validatedFindings))
    lines.push('')
    lines.push('## Findings by SESIP Control Area')
    lines.push('')
    lines.push(this.renderControlAreaSection(report.validatedFindings))
    lines.push('')
    lines.push('## Validation / False-positive review')
    lines.push('')
    for (const finding of report.validatedFindings) {
      lines.push(`### ${finding.vulnId} - ${finding.title}`)
      lines.push('')
      lines.push(`- Module: ${finding.moduleName}`)
      lines.push(`- Validation result: ${finding.validationResult}`)
      lines.push(`- Original severity/confidence: ${finding.originalSeverity} / ${finding.originalConfidence}`)
      lines.push(`- Revised severity/confidence: ${finding.revisedSeverity} / ${finding.revisedConfidence}`)
      lines.push(`- Reasoning: ${finding.reasoning}`)
      if (finding.failedAssumptions.length > 0) {
        lines.push(`- Failed assumptions: ${finding.failedAssumptions.join('; ')}`)
      }
      lines.push(`- Recommended action: ${finding.recommendedAction}`)
      lines.push('')
    }
    lines.push('## Developer follow-up items')
    lines.push('')
    for (const item of report.developerFollowUpItems) {
      lines.push(`- ${item}`)
    }
    lines.push('')
    return lines.join('\n')
  }

  private renderSeveritySection(findings: ValidatedFinding[]): string {
    const ordered: Array<ValidatedFinding['severity']> = [
      'critical',
      'high',
      'medium',
      'low',
      'informational',
      'not_visible',
    ]
    const lines: string[] = []
    for (const severity of ordered) {
      const items = findings.filter(item => item.revisedSeverity === severity)
      if (items.length === 0) {
        continue
      }
      lines.push(`### ${severity}`)
      lines.push('')
      for (const item of items) {
        lines.push(
          `- ${item.vulnId} | ${item.title} | ${item.validationResult} | ${item.moduleName}`
        )
      }
      lines.push('')
    }
    return lines.join('\n').trim()
  }

  private renderControlAreaSection(findings: ValidatedFinding[]): string {
    const groups = new Map<string, ValidatedFinding[]>()
    for (const finding of findings) {
      const key = finding.sesipControlArea || 'not_visible'
      const existing = groups.get(key) ?? []
      existing.push(finding)
      groups.set(key, existing)
    }

    const lines: string[] = []
    for (const [area, items] of groups.entries()) {
      lines.push(`### ${area}`)
      lines.push('')
      for (const item of items) {
        lines.push(`- ${item.vulnId} | ${item.title} | ${item.revisedSeverity}`)
      }
      lines.push('')
    }
    return lines.join('\n').trim()
  }
}
