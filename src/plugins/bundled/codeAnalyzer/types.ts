/**
 * Type definitions for code analyzer plugin.
 */

export interface AnalysisConfig {
  targetPath: string
  rules?: string[]
  outputFormat: 'json' | 'html' | 'pdf'
  outputPath?: string
  severityFilter?: string
}

export interface Evidence {
  file: string
  symbol?: string
  lines: string
  snippet: string
}

export interface Finding {
  vulnId: string
  title: string
  confidence: 'likely' | 'possible' | 'unclear'
  severity: 'critical' | 'high' | 'medium' | 'low' | 'informational'
  severityRationale: string
  description: string
  evidence: Evidence[]
  filesAffected: string[]
  attackScenario: Record<string, unknown>
  impact: Record<string, string>
  preconditions: string[]
  fixRecommendation: string
  patchDirection: string
  verification: Record<string, string[]>
  tags: string[]
}

export interface AnalysisRound {
  round: number
  tool: string
  findings: number
}

export interface Summary {
  total: number
  critical: number
  high: number
  medium: number
  low: number
  informational: number
}

export interface AnalysisResult {
  scanId: string
  timestamp: string
  targetPath: string
  analysisRounds: AnalysisRound[]
  summary: Summary
  findings: Finding[]
}

export interface RuleMatch {
  ruleId: string
  title: string
  severity: string
  confidence: string
  description: string
  file: string
  line: number
  snippet: string
  context: string
  remediation: string
  category: string
}

export interface SesipRule {
  id: string
  name: string
  category: string
  severity: string
  description?: string
  patterns: string[]
  falsePositives?: string[]
  remediation?: string
  examples?: {
    vulnerable?: string
    fixed?: string
  }
  requiresContext?: boolean
  inSecurityContext?: string[]
}
