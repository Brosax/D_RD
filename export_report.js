/**
 * Script to export code-analyzer JSON results to HTML report
 * Usage: bun run export_report.js <scan_result_json> [output_path]
 */

import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

async function main() {
  const args = process.argv.slice(2)

  if (args.length === 0) {
    console.error('Usage: bun run export_report.js <scan_result_json> [output_path]')
    process.exit(1)
  }

  const inputPath = args[0]
  const outputPath = args[1] || inputPath.replace('.json', '.html')

  // Read and parse the JSON
  const content = await readFile(inputPath, 'utf-8')
  const rawResult = JSON.parse(content)

  // Transform snake_case to camelCase for AnalysisResult interface
  const result = {
    scanId: rawResult.scan_id,
    timestamp: rawResult.timestamp,
    targetPath: rawResult.target_path,
    analysisRounds: rawResult.analysis_rounds || [],
    summary: rawResult.summary,
    findings: (rawResult.findings || []).map(f => ({
      vulnId: f.vuln_id,
      title: f.title,
      confidence: f.confidence,
      severity: f.severity,
      severityRationale: f.severity_rationale,
      description: f.description || '',
      evidence: (f.evidence || []).map(e => ({
        file: e.file,
        symbol: e.symbol,
        lines: String(e.lines),
        snippet: e.snippet
      })),
      filesAffected: f.files_affected || [],
      attackScenario: f.attack_scenario || {},
      impact: f.impact || {},
      preconditions: f.preconditions || [],
      fixRecommendation: f.fix_recommendation || '',
      patchDirection: f.patch_direction || '',
      verification: f.verification || {},
      tags: f.tags || []
    }))
  }

  // Dynamically import the HtmlExporter
  const htmlExporterPath = join(process.cwd(), 'src/plugins/bundled/codeAnalyzer/report/htmlExporter.ts')
  const { HtmlExporter } = await import(htmlExporterPath)

  // Use HtmlExporter
  const exporter = new HtmlExporter()
  const html = await exporter.export(result, outputPath)

  console.log(`Report generated: ${outputPath}`)
  console.log(`Summary: ${result.summary.total} findings (${result.summary.critical} critical, ${result.summary.high} high, ${result.summary.medium} medium, ${result.summary.low} low)`)
}

main().catch(console.error)
