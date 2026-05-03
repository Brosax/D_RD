/**
 * Type definitions for the SESIP code analysis plugin.
 */

export type AuditOutputFormat = 'json' | 'markdown'
export type AuditFocus = 'bootloader' | 'security' | 'all-scoped'
export type FindingConfidence = 'likely' | 'possible' | 'unclear'
export type FindingSeverity =
  | 'critical'
  | 'high'
  | 'medium'
  | 'low'
  | 'informational'
  | 'not_visible'
export type ValidationResult =
  | 'confirmed'
  | 'partially_supported'
  | 'false_positive'
  | 'hallucination'
export type ReviewStage = 'initial_review' | 'validation_review'

export interface AnalysisConfig {
  targetPath: string
  outputFormat: AuditOutputFormat
  outputPath?: string
  workerCount?: number
  include?: string[]
  focus: AuditFocus
}

export interface Evidence {
  file: string
  symbol?: string
  lines: string
  snippet: string
  status?: 'exists' | 'not_found' | 'not_checked'
}

export interface AuditUnit {
  moduleName: string
  rationale: string
  controlAreas: string[]
  files: string[]
  entryPoints: string[]
  responsibilities: string[]
  includedBy: 'heuristic' | 'user_include'
}

export interface ExcludedModule {
  moduleName: string
  reason: string
  files: string[]
}

export interface AuditScope {
  targetPath: string
  focus: AuditFocus
  discoveredFiles: string[]
  includedModules: AuditUnit[]
  excludedModules: ExcludedModule[]
  testedSample: string
  coverageSummary: string
}

export interface InitialFinding {
  vulnId: string
  title: string
  confidence: FindingConfidence
  severity: FindingSeverity
  severityRationale: string
  description: string
  observedFacts: string[]
  inferences: string[]
  hypotheses: string[]
  evidence: Evidence[]
  filesAffected: string[]
  attackScenario: {
    untrusted_inputs: string[]
    entry_point: string
    trigger_steps: string[]
  }
  impact: {
    confidentiality: string
    integrity: string
    availability: string
    scope_notes: string
  }
  preconditions: string[]
  reproduction: {
    level: string
    steps: string[]
  }
  fixRecommendation: string
  patchDirection: string
  verification: {
    tests: string[]
    code_checks: string[]
    runtime_checks: string[]
  }
  tags: string[]
  sesipControlArea: string
  reviewStage: 'initial_review'
  moduleName: string
}

export interface ValidatedFinding extends Omit<InitialFinding, 'reviewStage'> {
  reviewStage: ReviewStage
  validationResult: ValidationResult
  originalConfidence: FindingConfidence
  originalSeverity: FindingSeverity
  revisedConfidence: FindingConfidence
  revisedSeverity: FindingSeverity
  evidenceValidated: Evidence[]
  failedAssumptions: string[]
  reasoning: string
  recommendedAction: string
}

export interface ResultsSummary {
  totalInitial: number
  totalValidated: number
  confirmed: number
  partiallySupported: number
  falsePositive: number
  hallucination: number
  critical: number
  high: number
  medium: number
  low: number
  informational: number
  notVisible: number
}

export interface CodeAnalysisReport {
  scanId: string
  timestamp: string
  targetPath: string
  purpose: string
  motivation: string
  testedSample: string
  scope: AuditScope
  methodDescription: string[]
  resultsSummary: ResultsSummary
  validatedFindings: ValidatedFinding[]
  developerFollowUpItems: string[]
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
