/**
 * Model client for SESIP-oriented code analysis.
 */

import type { AgentDefinitionsResult } from '@claude-code-best/builtin-tools/tools/AgentTool/loadAgentsDir.js'
import { queryWithModel } from '../../../../services/api/claude.js'
import type { AppState } from '../../../../state/AppStateStore.js'
import type { ToolUseContext } from '../../../../Tool.js'
import { extractTextContent } from '../../../../utils/messages.js'
import { asSystemPrompt } from '../../../../utils/systemPromptType.js'
import type {
  AuditUnit,
  Evidence,
  FindingConfidence,
  FindingSeverity,
  InitialFinding,
  ValidationResult,
  ValidatedFinding,
} from '../types.js'

export interface LlmAnalysisResult {
  confidence: 'likely' | 'possible' | 'unclear' | 'unlikely'
  severity: 'critical' | 'high' | 'medium' | 'low' | 'informational' | 'not_visible'
  description: string
  impact?: Record<string, string>
  attack_scenario?: Record<string, unknown>
  preconditions?: string[]
  remediation?: string
  verification?: Record<string, string[]>
}

export interface AnalysisModelContext {
  abortController: AbortController
  getAppState: () => Pick<AppState, 'advisorModel' | 'effortValue' | 'mcp'>
  options: {
    agentDefinitions: Pick<AgentDefinitionsResult, 'activeAgents'>
    appendSystemPrompt?: string
    isNonInteractiveSession: boolean
    mainLoopModel: string
    querySource?: ToolUseContext['options']['querySource']
  }
  addNotification?: ToolUseContext['addNotification']
  agentId?: ToolUseContext['agentId']
}

type ModelQueryFn = typeof queryWithModel

type InitialReviewResponse = Partial<{
  findings: Array<Record<string, unknown>>
}>

type ValidationReviewResponse = Partial<{
  findings: Array<Record<string, unknown>>
}>

export class LocalModelClient {
  private queryModel: ModelQueryFn

  constructor(queryModel: ModelQueryFn = queryWithModel) {
    this.queryModel = queryModel
  }

  async checkAvailability(): Promise<boolean> {
    return true
  }

  async reviewAuditUnit(
    auditUnit: AuditUnit,
    codeBundle: string,
    modelContext?: AnalysisModelContext
  ): Promise<InitialFinding[]> {
    if (!modelContext) {
      return []
    }

    try {
      const prompt = this.buildInitialReviewPrompt(auditUnit, codeBundle)
      const response = await this.callModel(prompt, modelContext)
      const parsed = this.parseJson<InitialReviewResponse>(response)
      return (parsed.findings ?? []).map((item, index) =>
        this.normalizeInitialFinding(item, auditUnit, index + 1)
      )
    } catch {
      return []
    }
  }

  async validateFindings(
    auditUnit: AuditUnit,
    findings: InitialFinding[],
    codeBundle: string,
    modelContext?: AnalysisModelContext
  ): Promise<ValidatedFinding[]> {
    if (!modelContext || findings.length === 0) {
      return []
    }

    try {
      const prompt = this.buildValidationPrompt(auditUnit, findings, codeBundle)
      const response = await this.callModel(prompt, modelContext)
      const parsed = this.parseJson<ValidationReviewResponse>(response)
      return findings.map((finding, index) =>
        this.normalizeValidatedFinding(parsed.findings?.[index] ?? {}, finding)
      )
    } catch {
      return findings.map(finding => this.buildFallbackValidation(finding))
    }
  }

  async analyzeContext(
    codeSnippet: string,
    context: Record<string, string>,
    modelContext?: AnalysisModelContext
  ): Promise<LlmAnalysisResult | null> {
    if (!modelContext) {
      return null
    }

    try {
      const prompt = `Analyze this security-relevant code snippet for implementation risks.

Rules:
- only claim what is visible
- if impact is unclear, keep confidence low

Context:
${JSON.stringify(context, null, 2)}

Code:
\`\`\`
${codeSnippet}
\`\`\`

Return JSON:
{
  "confidence": "likely|possible|unclear|unlikely",
  "severity": "critical|high|medium|low|informational|not_visible",
  "description": "string",
  "impact": {"confidentiality":"", "integrity":"", "availability":""},
  "attack_scenario": {"entry_point":"", "trigger_steps":[]},
  "preconditions": [],
  "remediation": "string",
  "verification": {"tests": [], "code_checks": [], "runtime_checks": []}
}`
      const response = await this.callModel(prompt, modelContext)
      return this.parseJson<LlmAnalysisResult>(response)
    } catch {
      return null
    }
  }

  private buildInitialReviewPrompt(auditUnit: AuditUnit, codeBundle: string): string {
    return `You are performing SESIP certification-supporting source code analysis.

Task:
- implementation-level vulnerability review
- security functionality review
- hardware weakness related code review
- focus on bootloader, secure boot, update, communication, lifecycle, crypto, debug authentication, and privilege boundaries

Rules:
- only conclude from visible evidence
- separate observed_fact, inference, and hypothesis
- if context is missing, use severity "not_visible" and explicit "not_visible" notes
- do not invent files, functions, or call paths

Audit unit:
- module_name: ${auditUnit.moduleName}
- rationale: ${auditUnit.rationale}
- sesip_control_areas: ${auditUnit.controlAreas.join(', ') || 'not_visible'}
- entry_points: ${auditUnit.entryPoints.join(', ') || 'not_visible'}

Code bundle:
\`\`\`
${codeBundle}
\`\`\`

Return JSON:
{
  "findings": [
    {
      "title": "string",
      "confidence": "likely|possible|unclear",
      "severity": "critical|high|medium|low|informational|not_visible",
      "severity_rationale": "string",
      "description": "string",
      "observed_facts": ["string"],
      "inferences": ["string"],
      "hypotheses": ["string"],
      "evidence": [{"file":"", "symbol":"", "lines":"", "snippet":""}],
      "files_affected": ["string"],
      "attack_scenario": {"untrusted_inputs": [], "entry_point": "", "trigger_steps": []},
      "impact": {"confidentiality":"", "integrity":"", "availability":"", "scope_notes":""},
      "preconditions": ["string"],
      "reproduction": {"level":"", "steps":[]},
      "fix_recommendation": "string",
      "patch_direction": "string",
      "verification": {"tests": [], "code_checks": [], "runtime_checks": []},
      "tags": ["string"],
      "sesip_control_area": "string"
    }
  ]
}

If no issue is visible, return {"findings":[]}.`
  }

  private buildValidationPrompt(
    auditUnit: AuditUnit,
    findings: InitialFinding[],
    codeBundle: string
  ): string {
    return `You are performing the SESIP validation pass for AI-generated findings.

Validation classes:
- confirmed
- partially_supported
- false_positive
- hallucination

Validation checks:
- evidence existence
- data-flow reachability
- boundary and context
- API semantics
- exploitability realism

Rules:
- keep observed facts separate from inferences
- if evidence is insufficient, downgrade rather than over-claim
- hallucination means referenced code is not visible in the provided evidence

Audit unit:
- module_name: ${auditUnit.moduleName}

Code bundle:
\`\`\`
${codeBundle}
\`\`\`

Initial findings JSON:
\`\`\`json
${JSON.stringify(findings, null, 2)}
\`\`\`

Return JSON:
{
  "findings": [
    {
      "validation_result": "confirmed|partially_supported|false_positive|hallucination",
      "revised_confidence": "likely|possible|unclear",
      "revised_severity": "critical|high|medium|low|informational|not_visible",
      "evidence_validated": [{"file":"", "symbol":"", "lines":"", "snippet":"", "status":"exists|not_found|not_checked"}],
      "failed_assumptions": ["string"],
      "reasoning": "string",
      "recommended_action": "string"
    }
  ]
}`
  }

  private normalizeInitialFinding(
    raw: Record<string, unknown>,
    auditUnit: AuditUnit,
    ordinal: number
  ): InitialFinding {
    return {
      vulnId: `VULN-S1-${String(ordinal).padStart(3, '0')}`,
      title: this.stringValue(raw.title, 'Potential security issue'),
      confidence: this.normalizeConfidence(raw.confidence),
      severity: this.normalizeSeverity(raw.severity),
      severityRationale: this.stringValue(raw.severity_rationale, 'Limited visible rationale'),
      description: this.stringValue(raw.description, 'No description provided'),
      observedFacts: this.stringArray(raw.observed_facts),
      inferences: this.stringArray(raw.inferences),
      hypotheses: this.stringArray(raw.hypotheses),
      evidence: this.normalizeEvidenceArray(raw.evidence),
      filesAffected: this.stringArray(raw.files_affected),
      attackScenario: this.normalizeAttackScenario(raw.attack_scenario),
      impact: this.normalizeImpact(raw.impact),
      preconditions: this.stringArray(raw.preconditions),
      reproduction: this.normalizeReproduction(raw.reproduction),
      fixRecommendation: this.stringValue(raw.fix_recommendation, 'Manual remediation review required'),
      patchDirection: this.stringValue(raw.patch_direction, ''),
      verification: this.normalizeVerification(raw.verification),
      tags: this.stringArray(raw.tags),
      sesipControlArea: this.stringValue(raw.sesip_control_area, auditUnit.controlAreas[0] ?? 'not_visible'),
      reviewStage: 'initial_review',
      moduleName: auditUnit.moduleName,
    }
  }

  private normalizeValidatedFinding(
    raw: Record<string, unknown>,
    finding: InitialFinding
  ): ValidatedFinding {
    const revisedConfidence = this.normalizeConfidence(raw.revised_confidence ?? finding.confidence)
    const revisedSeverity = this.normalizeSeverity(raw.revised_severity ?? finding.severity)
    return {
      ...finding,
      reviewStage: 'validation_review',
      validationResult: this.normalizeValidationResult(raw.validation_result),
      originalConfidence: finding.confidence,
      originalSeverity: finding.severity,
      revisedConfidence,
      revisedSeverity,
      confidence: revisedConfidence,
      severity: revisedSeverity,
      evidenceValidated: this.normalizeEvidenceArray(raw.evidence_validated),
      failedAssumptions: this.stringArray(raw.failed_assumptions),
      reasoning: this.stringValue(raw.reasoning, 'Validation reasoning not provided'),
      recommendedAction: this.stringValue(raw.recommended_action, 'manual_follow_up'),
    }
  }

  private buildFallbackValidation(finding: InitialFinding): ValidatedFinding {
    return {
      ...finding,
      reviewStage: 'validation_review',
      validationResult: 'partially_supported',
      originalConfidence: finding.confidence,
      originalSeverity: finding.severity,
      revisedConfidence: finding.confidence,
      revisedSeverity: finding.severity,
      confidence: finding.confidence,
      severity: finding.severity,
      evidenceValidated: finding.evidence.map(item => ({ ...item, status: 'not_checked' })),
      failedAssumptions: [],
      reasoning: 'Validation pass unavailable; keeping initial review with explicit uncertainty.',
      recommendedAction: 'manual_validation_required',
    }
  }

  private async callModel(prompt: string, modelContext: AnalysisModelContext): Promise<string> {
    const appState = modelContext.getAppState()
    const response = await this.queryModel({
      systemPrompt: asSystemPrompt([]),
      userPrompt: prompt,
      signal: modelContext.abortController.signal,
      options: {
        model: modelContext.options.mainLoopModel,
        querySource: modelContext.options.querySource ?? 'slash_command:code-analyzer',
        agents: modelContext.options.agentDefinitions.activeAgents,
        isNonInteractiveSession: modelContext.options.isNonInteractiveSession,
        hasAppendSystemPrompt: !!modelContext.options.appendSystemPrompt,
        mcpTools: appState.mcp.tools,
        hasPendingMcpServers: appState.mcp.clients.some(client => client.type === 'pending'),
        effortValue: appState.effortValue,
        advisorModel: appState.advisorModel,
        addNotification: modelContext.addNotification,
        agentId: modelContext.agentId,
      },
    })

    return extractTextContent(
      response.message.content as readonly { readonly type: string }[],
      '\n'
    )
  }

  private parseJson<T>(response: string): T {
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('No JSON found')
    }
    return JSON.parse(jsonMatch[0]) as T
  }

  private normalizeConfidence(value: unknown): FindingConfidence {
    return value === 'likely' || value === 'possible' || value === 'unclear'
      ? value
      : 'unclear'
  }

  private normalizeSeverity(value: unknown): FindingSeverity {
    return value === 'critical' ||
      value === 'high' ||
      value === 'medium' ||
      value === 'low' ||
      value === 'informational' ||
      value === 'not_visible'
      ? value
      : 'not_visible'
  }

  private normalizeValidationResult(value: unknown): ValidationResult {
    return value === 'confirmed' ||
      value === 'partially_supported' ||
      value === 'false_positive' ||
      value === 'hallucination'
      ? value
      : 'partially_supported'
  }

  private normalizeEvidenceArray(value: unknown): Evidence[] {
    if (!Array.isArray(value)) {
      return []
    }
    return value.map(item => {
      const record = item as Record<string, unknown>
      return {
        file: this.stringValue(record.file),
        symbol: this.stringValue(record.symbol),
        lines: this.stringValue(record.lines),
        snippet: this.stringValue(record.snippet),
        status:
          record.status === 'exists' || record.status === 'not_found' || record.status === 'not_checked'
            ? record.status
            : undefined,
      }
    })
  }

  private normalizeAttackScenario(value: unknown): InitialFinding['attackScenario'] {
    const record = this.recordValue(value)
    return {
      untrusted_inputs: this.stringArray(record.untrusted_inputs),
      entry_point: this.stringValue(record.entry_point, 'not_visible'),
      trigger_steps: this.stringArray(record.trigger_steps),
    }
  }

  private normalizeImpact(value: unknown): InitialFinding['impact'] {
    const record = this.recordValue(value)
    return {
      confidentiality: this.stringValue(record.confidentiality, 'not_visible'),
      integrity: this.stringValue(record.integrity, 'not_visible'),
      availability: this.stringValue(record.availability, 'not_visible'),
      scope_notes: this.stringValue(record.scope_notes, ''),
    }
  }

  private normalizeReproduction(value: unknown): InitialFinding['reproduction'] {
    const record = this.recordValue(value)
    return {
      level: this.stringValue(record.level, 'not_visible'),
      steps: this.stringArray(record.steps),
    }
  }

  private normalizeVerification(value: unknown): InitialFinding['verification'] {
    const record = this.recordValue(value)
    return {
      tests: this.stringArray(record.tests),
      code_checks: this.stringArray(record.code_checks),
      runtime_checks: this.stringArray(record.runtime_checks),
    }
  }

  private stringValue(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value : fallback
  }

  private stringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter(item => typeof item === 'string') : []
  }

  private recordValue(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  }
}
