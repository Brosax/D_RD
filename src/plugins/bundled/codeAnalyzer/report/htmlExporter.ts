/**
 * Legacy HTML exporter retained for compatibility.
 *
 * The primary SESIP report format is Markdown. This exporter renders a simple
 * HTML view from the Markdown-oriented report structure.
 */

import { writeFile } from 'fs/promises'
import type { CodeAnalysisReport } from '../types.js'

export class HtmlExporter {
  async export(report: CodeAnalysisReport, outputPath?: string): Promise<string> {
    const findings = report.validatedFindings
      .map(
        finding => `<li><strong>${this.escapeHtml(finding.vulnId)}</strong> ${this.escapeHtml(
          finding.title
        )} (${this.escapeHtml(finding.revisedSeverity)})</li>`
      )
      .join('')

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SESIP Code Analysis Report</title>
</head>
<body>
  <h1>SESIP Code Analysis Report</h1>
  <p>Scan ID: ${this.escapeHtml(report.scanId)}</p>
  <p>Target Path: ${this.escapeHtml(report.targetPath)}</p>
  <p>Timestamp: ${this.escapeHtml(report.timestamp)}</p>
  <h2>Results Summary</h2>
  <ul>
    <li>Initial findings: ${report.resultsSummary.totalInitial}</li>
    <li>Validated findings: ${report.resultsSummary.totalValidated}</li>
    <li>Confirmed: ${report.resultsSummary.confirmed}</li>
    <li>Partially supported: ${report.resultsSummary.partiallySupported}</li>
    <li>False positive: ${report.resultsSummary.falsePositive}</li>
    <li>Hallucination: ${report.resultsSummary.hallucination}</li>
  </ul>
  <h2>Findings</h2>
  <ul>${findings || '<li>No findings</li>'}</ul>
</body>
</html>`

    if (outputPath) {
      await writeFile(outputPath, html, 'utf-8')
    }
    return html
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;')
  }
}
