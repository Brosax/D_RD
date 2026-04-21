/**
 * HTML exporter for analysis results - SESIP Security Report Style
 */

import { writeFile } from 'fs/promises'
import type { AnalysisResult, Finding } from '../types.js'

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#f85149',
  high: '#f78166',
  medium: '#d29922',
  low: '#58a6ff',
  informational: '#8b949e',
}

const HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SESIP Security Analysis Report</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f1117; color: #e6edf3; line-height: 1.6; }
        .container { max-width: 1200px; margin: 0 auto; padding: 40px 20px; }
        .header { text-align: center; margin-bottom: 40px; padding: 30px; background: linear-gradient(135deg, #1a1f2e 0%, #2d1f3d 100%); border-radius: 12px; border: 1px solid #30363d; }
        .header h1 { font-size: 2em; margin-bottom: 10px; background: linear-gradient(90deg, #f78166, #a371f7); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .header .meta { color: #8b949e; font-size: 0.9em; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 40px; }
        .stat-card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 20px; text-align: center; }
        .stat-card.critical { border-left: 4px solid #f85149; }
        .stat-card.high { border-left: 4px solid #f78166; }
        .stat-card.medium { border-left: 4px solid #d29922; }
        .stat-card.low { border-left: 4px solid #58a6ff; }
        .stat-card .count { font-size: 2.5em; font-weight: bold; }
        .stat-card .label { color: #8b949e; font-size: 0.85em; text-transform: uppercase; letter-spacing: 1px; }
        .severity-critical { color: #f85149; }
        .severity-high { color: #f78166; }
        .severity-medium { color: #d29922; }
        .severity-low { color: #58a6ff; }
        .finding { background: #161b22; border: 1px solid #30363d; border-radius: 8px; margin-bottom: 20px; overflow: hidden; }
        .finding-header { padding: 20px; display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #21262d; }
        .finding-id { font-family: monospace; background: #388bfd20; color: #58a6ff; padding: 2px 8px; border-radius: 4px; font-size: 0.85em; }
        .finding-title { font-size: 1.1em; font-weight: 600; margin: 8px 0; }
        .finding-meta { font-size: 0.85em; color: #8b949e; }
        .finding-body { padding: 20px; }
        .code-block { background: #0d1117; border: 1px solid #30363d; border-radius: 6px; padding: 15px; margin: 10px 0; overflow-x: auto; font-family: 'Fira Code', 'Consolas', monospace; font-size: 0.9em; line-height: 1.5; }
        .code-block .line-number { color: #484f58; margin-right: 15px; user-select: none; }
        .code-block .highlight { background: #f8514920; display: block; margin: 0 -15px; padding: 0 15px; }
        .tag { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.75em; font-weight: 600; text-transform: uppercase; margin-right: 5px; }
        .tag-cwe { background: #a371f720; color: #a371f7; }
        .tag-sesip { background: #388bfd20; color: #58a6ff; }
        .detail-row { margin: 10px 0; }
        .detail-label { color: #8b949e; font-size: 0.85em; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
        .footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #30363d; color: #8b949e; font-size: 0.85em; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>SESIP Security Analysis Report</h1>
            <p class="meta">Scan ID: {scan_id} | Target: {target_path} | Date: {timestamp}</p>
        </div>

        <div class="summary">
            <div class="stat-card critical">
                <div class="count severity-critical">{critical}</div>
                <div class="label">Critical</div>
            </div>
            <div class="stat-card high">
                <div class="count severity-high">{high}</div>
                <div class="label">High</div>
            </div>
            <div class="stat-card medium">
                <div class="count severity-medium">{medium}</div>
                <div class="label">Medium</div>
            </div>
            <div class="stat-card low">
                <div class="count severity-low">{low}</div>
                <div class="label">Low</div>
            </div>
        </div>

        <div class="findings-list">
            {findings_html}
        </div>

        <div class="footer">
            <p>SESIP Security Analysis Report | Generated {timestamp} | Rules: SESIP v1.0</p>
        </div>
    </div>
</body>
</html>`

const FINDING_TEMPLATE = `
<div class="finding">
    <div class="finding-header">
        <div>
            <span class="finding-id">{vuln_id}</span>
            <div class="finding-title">{title}</div>
            <div class="finding-meta">
                <span class="severity-{severity}">{severity_upper}</span> |
                <span>Confidence: {confidence}</span> |
                <span>File: {file}:{line}</span>
            </div>
        </div>
    </div>
    <div class="finding-body">
        <div class="detail-row">
            <div class="detail-label">Description</div>
            <p>{description}</p>
        </div>
        <div class="code-block">{code_block}</div>
        {attack_scenario}
        {impact}
        <div class="detail-row">
            <div class="detail-label">Remediation</div>
            <p>{fix_recommendation}</p>
        </div>
        <div class="finding-tags">
            {tags_html}
        </div>
    </div>
</div>
`

const ATTACK_SCENARIO_TEMPLATE = `
<div class="detail-row">
    <div class="detail-label">Attack Scenario</div>
    <p>{text}</p>
</div>
`

const IMPACT_TEMPLATE = `
<div class="detail-row">
    <div class="detail-label">Impact</div>
    <p>{text}</p>
</div>
`

export class HtmlExporter {
  async export(result: AnalysisResult, outputPath?: string): Promise<string> {
    const findingsHtml = this.renderFindings(result.findings)

    const html = HTML_TEMPLATE
      .replace('{scan_id}', this.escapeHtml(result.scanId))
      .replace('{target_path}', this.escapeHtml(result.targetPath))
      .replace('{timestamp}', this.formatTimestamp(result.timestamp))
      .replace('{critical}', String(result.summary.critical))
      .replace('{high}', String(result.summary.high))
      .replace('{medium}', String(result.summary.medium))
      .replace('{low}', String(result.summary.low))
      .replace('{findings_html}', findingsHtml)

    if (outputPath) {
      await writeFile(outputPath, html, 'utf-8')
    }

    return html
  }

  private formatTimestamp(iso: string): string {
    try {
      const date = new Date(iso)
      return date.toISOString().split('T')[0]
    } catch {
      return iso
    }
  }

  private renderFindings(findings: Finding[]): string {
    if (!findings.length) {
      return '<p style="color: #8b949e; text-align: center; padding: 40px;">No vulnerabilities found.</p>'
    }

    return findings.map((f) => this.renderFinding(f)).join('\n')
  }

  private renderFinding(f: Finding): string {
    const severity = f.severity

    // Build attack scenario if available
    let attackScenarioHtml = ''
    if (f.attackScenario) {
      const scenarioText = this.extractTextFromRecord(f.attackScenario)
      if (scenarioText) {
        attackScenarioHtml = ATTACK_SCENARIO_TEMPLATE.replace('{text}', this.escapeHtml(scenarioText))
      }
    }

    // Build impact if available
    let impactHtml = ''
    if (f.impact) {
      const impactText = this.extractTextFromRecord(f.impact)
      if (impactText) {
        impactHtml = IMPACT_TEMPLATE.replace('{text}', this.escapeHtml(impactText))
      }
    }

    // Format tags
    const tagsHtml = f.tags.map((tag) => {
      const tagClass = tag.startsWith('CWE-') ? 'tag-cwe' : 'tag-sesip'
      return `<span class="tag ${tagClass}">${this.escapeHtml(tag)}</span>`
    }).join('')

    // Get evidence for code snippet
    const evidence = f.evidence[0] ?? { file: 'unknown', lines: '0', snippet: '' }
    const codeBlock = this.buildCodeBlock(evidence.snippet, evidence.lines)

    return FINDING_TEMPLATE
      .replace('{vuln_id}', this.escapeHtml(f.vulnId))
      .replace('{title}', this.escapeHtml(f.title))
      .replace('{severity}', severity)
      .replace('{severity_upper}', severity.toUpperCase())
      .replace('{confidence}', f.confidence)
      .replace('{description}', this.escapeHtml(f.description) || 'No description provided.')
      .replace('{file}', this.escapeHtml(evidence.file))
      .replace('{line}', this.escapeHtml(evidence.lines))
      .replace('{code_block}', codeBlock)
      .replace('{attack_scenario}', attackScenarioHtml)
      .replace('{impact}', impactHtml)
      .replace('{fix_recommendation}', this.escapeHtml(f.fixRecommendation) || 'No recommendation available.')
      .replace('{tags_html}', tagsHtml)
  }

  private buildCodeBlock(snippet: string, vulnLine: string): string {
    const lines = snippet.split('\n')
    const vulnLineNum = parseInt(vulnLine, 10) || 0

    return lines.map((line) => {
      // Match patterns like "72|    code" or "   72|    code"
      const match = line.match(/^(\s*)(\d+)\|(.*)$/)
      if (match) {
        const [, indent, lineNumStr, code] = match
        const lineNum = parseInt(lineNumStr, 10)
        const isVulnerable = lineNum === vulnLineNum

        if (isVulnerable) {
          return `${indent}<span class="line-number">${lineNum}</span><span class="highlight"><span class="line-number">${lineNum}</span>${this.escapeHtml(code)}</span>`
        }
        return `${indent}<span class="line-number">${lineNum}</span>${this.escapeHtml(code)}`
      }
      // Plain code line - wrap in highlight if no line numbers
      if (vulnLineNum === 0 && line.trim()) {
        return this.escapeHtml(line)
      }
      return this.escapeHtml(line)
    }).join('\n')
  }

  private extractTextFromRecord(record: Record<string, unknown>): string {
    // Try common keys
    const keys = ['text', 'description', 'summary', 'value']
    for (const key of keys) {
      if (typeof record[key] === 'string') {
        return record[key] as string
      }
    }
    // Fallback: stringify first string value found
    for (const value of Object.values(record)) {
      if (typeof value === 'string' && value.length > 0) {
        return value
      }
    }
    return ''
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }
}