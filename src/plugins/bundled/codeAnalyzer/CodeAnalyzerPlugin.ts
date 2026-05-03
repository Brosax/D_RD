/**
 * SESIP code analysis plugin - certification support workflow.
 */

import { writeFile } from 'fs/promises'
import { basename, dirname, join, relative, resolve, sep } from 'path'
import { createSystemMessage } from '../../../utils/messages.js'
import type { Message } from '../../../types/message.js'
import { LocalModelClient } from './llm/localClient.js'
import type { AnalysisModelContext } from './llm/localClient.js'
import { JsonExporter } from './report/jsonExporter.js'
import { MarkdownExporter } from './report/markdownExporter.js'
import { FileDiscovery } from './scanner/fileDiscovery.js'
import { FileParser } from './scanner/fileParser.js'
import type {
  AnalysisConfig,
  AuditFocus,
  AuditScope,
  AuditUnit,
  CodeAnalysisReport,
  ExcludedModule,
  FindingConfidence,
  FindingSeverity,
  InitialFinding,
  ResultsSummary,
  ValidatedFinding,
} from './types.js'

const SOURCE_SNIPPET_LIMIT = 4000
const DEFAULT_OUTPUT_FILE = 'sesip-code-analysis-report.md'
const SECURITY_PATH_HINTS = [
  'boot',
  'secure',
  'security',
  'crypto',
  'auth',
  'update',
  'firmware',
  'debug',
  'trust',
  'key',
  'attest',
  'lifecycle',
]
const SECURITY_CODE_HINTS = [
  'verify',
  'signature',
  'certificate',
  'crypt',
  'aes',
  'sha',
  'hmac',
  'nonce',
  'boot',
  'rollback',
  'auth',
  'debug',
  'fuse',
  'privilege',
]

export class CodeAnalyzerPlugin {
  private scanner: FileDiscovery
  private parser: FileParser
  private llmClient: LocalModelClient
  private vulnCounter: number

  constructor(llmClient: LocalModelClient = new LocalModelClient()) {
    this.scanner = new FileDiscovery()
    this.parser = new FileParser()
    this.llmClient = llmClient
    this.vulnCounter = 1
  }

  async execute(args: string[], context: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.vulnCounter = 1

    try {
      const config = this.parseArgs(args)
      if (!config.targetPath) {
        return {
          status: 'error',
          message:
            'Usage: /code-analyzer <path_to_code> [--format markdown|json] [--output <file>] [--workers <count>] [--include <path-or-glob>] [--focus <bootloader|security|all-scoped>]',
          actionRequired: 'Ask user to provide code path',
        }
      }

      const targetPath = resolve(config.targetPath)
      const modelContext = this.getModelContext(context)
      this.announce(context, 'Discovering source packages')
      this.updateProgress(context, {
        phase: 'Discovering source packages',
        filesScanned: 0,
        filesTotal: 0,
        runtimeMinutes: 1,
      })

      const discoveredFiles = await this.scanner.scan(targetPath)
      if (!discoveredFiles.length) {
        return {
          status: 'error',
          message: `No source files found in ${targetPath}`,
          actionRequired: 'Ask user to verify path',
        }
      }

      this.announce(context, 'Identifying security related modules')
      const scope = await this.buildAuditScope(config, targetPath, discoveredFiles)
      this.updateProgress(context, {
        phase: 'Identifying security related modules',
        filesScanned: scope.includedModules.length,
        filesTotal: scope.includedModules.length,
        runtimeMinutes: 1,
      })

      this.announce(context, 'Building tested sample summary')
      const initialFindings: InitialFinding[] = []
      const validatedFindings: ValidatedFinding[] = []

      for (const [index, auditUnit] of scope.includedModules.entries()) {
        this.announce(context, `Reviewing module ${auditUnit.moduleName}`)
        this.updateProgress(context, {
          phase: `Reviewing module ${auditUnit.moduleName}`,
          filesScanned: index,
          filesTotal: scope.includedModules.length,
          runtimeMinutes: 1,
        })
        const codeBundle = await this.buildCodeBundle(targetPath, auditUnit.files)
        const reviewed = await this.llmClient.reviewAuditUnit(auditUnit, codeBundle, modelContext)
        const normalizedReviewed = reviewed.map(item => this.assignFindingIdentity(item, auditUnit))
        initialFindings.push(...normalizedReviewed)
      }

      this.announce(context, 'Validating findings')
      for (const [index, auditUnit] of scope.includedModules.entries()) {
        const unitFindings = initialFindings.filter(item => item.moduleName === auditUnit.moduleName)
        if (unitFindings.length === 0) {
          continue
        }
        this.updateProgress(context, {
          phase: 'Validating findings',
          filesScanned: index + 1,
          filesTotal: scope.includedModules.length,
          runtimeMinutes: 1,
        })
        const codeBundle = await this.buildCodeBundle(targetPath, auditUnit.files)
        const validated = await this.llmClient.validateFindings(
          auditUnit,
          unitFindings,
          codeBundle,
          modelContext
        )
        validatedFindings.push(...validated)
      }

      const report = this.buildReport(targetPath, scope, initialFindings, validatedFindings)
      this.announce(context, 'Writing code analysis report')
      this.updateProgress(context, {
        phase: 'Writing code analysis report',
        filesScanned: scope.includedModules.length,
        filesTotal: scope.includedModules.length,
        runtimeMinutes: 1,
      })

      return this.exportResult(report, config.outputFormat, config.outputPath)
    } finally {
      this.clearProgress(context)
    }
  }

  private async buildAuditScope(
    config: AnalysisConfig,
    targetPath: string,
    discoveredFiles: string[]
  ): Promise<AuditScope> {
    const grouped = new Map<string, string[]>()
    for (const file of discoveredFiles) {
      const moduleName = this.deriveModuleName(targetPath, file)
      const existing = grouped.get(moduleName) ?? []
      existing.push(file)
      grouped.set(moduleName, existing)
    }

    const includedModules: AuditUnit[] = []
    const excludedModules: ExcludedModule[] = []
    for (const [moduleName, files] of grouped.entries()) {
      const scoping = await this.classifyModule(config.focus, targetPath, moduleName, files, config.include ?? [])
      if (scoping.include) {
        includedModules.push({
          moduleName,
          rationale: scoping.reason,
          controlAreas: scoping.controlAreas,
          files,
          entryPoints: scoping.entryPoints,
          responsibilities: scoping.responsibilities,
          includedBy: scoping.includedBy,
        })
      } else {
        excludedModules.push({
          moduleName,
          reason: scoping.reason,
          files,
        })
      }
    }

    includedModules.sort((a, b) => a.moduleName.localeCompare(b.moduleName))
    excludedModules.sort((a, b) => a.moduleName.localeCompare(b.moduleName))

    const testedSample = `Manual SESIP-oriented source analysis of ${includedModules.length} scoped module(s) from ${discoveredFiles.length} discovered source file(s), prioritizing bootloader and security related source code.`
    const coverageSummary = `Included ${includedModules.length} module(s) and excluded ${excludedModules.length} module(s) based on security relevance heuristics and explicit include arguments.`

    return {
      targetPath,
      focus: config.focus,
      discoveredFiles,
      includedModules,
      excludedModules,
      testedSample,
      coverageSummary,
    }
  }

  private async classifyModule(
    focus: AuditFocus,
    targetPath: string,
    moduleName: string,
    files: string[],
    includes: string[]
  ): Promise<{
    include: boolean
    reason: string
    controlAreas: string[]
    entryPoints: string[]
    responsibilities: string[]
    includedBy: 'heuristic' | 'user_include'
  }> {
    const relFiles = files.map(file => relative(targetPath, file).replaceAll('\\', '/'))
    const forceIncluded = includes.some(pattern => relFiles.some(file => file.includes(pattern)))
    const pathText = `${moduleName} ${relFiles.join(' ')}`.toLowerCase()
    const contentSamples = await Promise.all(files.slice(0, 2).map(file => this.parser.parse(file)))
    const contentText = contentSamples.filter(Boolean).join('\n').toLowerCase()
    const hasSecurityPathHint = SECURITY_PATH_HINTS.some(hint => pathText.includes(hint))
    const hasSecurityCodeHint = SECURITY_CODE_HINTS.some(hint => contentText.includes(hint))
    const bootloaderMatch = pathText.includes('boot')
    const includeByFocus =
      focus === 'all-scoped'
        ? hasSecurityPathHint || hasSecurityCodeHint
        : focus === 'bootloader'
          ? bootloaderMatch
          : hasSecurityPathHint || hasSecurityCodeHint

    const controlAreas = this.inferControlAreas(pathText, contentText)
    const entryPoints = relFiles.slice(0, 3)
    const responsibilities = this.inferResponsibilities(pathText, contentText)

    if (forceIncluded) {
      return {
        include: true,
        reason: 'Included because it matched an explicit --include path.',
        controlAreas,
        entryPoints,
        responsibilities,
        includedBy: 'user_include',
      }
    }

    if (includeByFocus) {
      return {
        include: true,
        reason:
          focus === 'bootloader'
            ? 'Included because the module appears bootloader-related.'
            : 'Included because the module appears security-relevant by path or implementation hints.',
        controlAreas,
        entryPoints,
        responsibilities,
        includedBy: 'heuristic',
      }
    }

    return {
      include: false,
      reason: 'Excluded because no bootloader or security relevance was visible during repository scoping.',
      controlAreas,
      entryPoints,
      responsibilities,
      includedBy: 'heuristic',
    }
  }

  private inferControlAreas(pathText: string, contentText: string): string[] {
    const areas = new Set<string>()
    if (/(crypt|sha|aes|nonce|hmac|key|cert)/.test(pathText + contentText)) {
      areas.add('Cryptographic Operations')
    }
    if (/(auth|privilege|permission|access)/.test(pathText + contentText)) {
      areas.add('Access Control')
    }
    if (/(input|parse|validate|length|bounds)/.test(pathText + contentText)) {
      areas.add('Input Validation')
    }
    if (/(memcpy|strcpy|buffer|alloc|free|pointer)/.test(contentText)) {
      areas.add('Memory Safety')
    }
    if (/(error|log|debug|assert)/.test(pathText + contentText)) {
      areas.add('Error Handling')
    }
    if (areas.size === 0) {
      areas.add('Secure Coding')
    }
    return [...areas]
  }

  private inferResponsibilities(pathText: string, contentText: string): string[] {
    const responsibilities: string[] = []
    if (/(boot|image|firmware)/.test(pathText + contentText)) {
      responsibilities.push('boot orchestration or firmware image handling')
    }
    if (/(verify|signature|certificate|attest)/.test(pathText + contentText)) {
      responsibilities.push('authenticity or signature verification')
    }
    if (/(update|rollback|lifecycle)/.test(pathText + contentText)) {
      responsibilities.push('device update or lifecycle management')
    }
    if (/(uart|spi|i2c|can|tcp|udp|http|ble)/.test(pathText + contentText)) {
      responsibilities.push('security-relevant communication handling')
    }
    if (responsibilities.length === 0) {
      responsibilities.push('security-relevant implementation detail not fully visible')
    }
    return responsibilities
  }

  private assignFindingIdentity(finding: InitialFinding, auditUnit: AuditUnit): InitialFinding {
    return {
      ...finding,
      vulnId: `VULN-S1-${String(this.vulnCounter++).padStart(3, '0')}`,
      moduleName: auditUnit.moduleName,
      sesipControlArea: finding.sesipControlArea || auditUnit.controlAreas[0] || 'Secure Coding',
      filesAffected: finding.filesAffected.length > 0 ? finding.filesAffected : auditUnit.files,
    }
  }

  private buildReport(
    targetPath: string,
    scope: AuditScope,
    initialFindings: InitialFinding[],
    validatedFindings: ValidatedFinding[]
  ): CodeAnalysisReport {
    const findings: ValidatedFinding[] =
      validatedFindings.length > 0
        ? validatedFindings
        : initialFindings.map<ValidatedFinding>(finding => ({
          ...finding,
          reviewStage: 'validation_review',
          validationResult: 'partially_supported',
          originalConfidence: finding.confidence,
          originalSeverity: finding.severity,
          revisedConfidence: finding.confidence,
          revisedSeverity: finding.severity,
          confidence: finding.confidence,
          severity: finding.severity,
          evidenceValidated: finding.evidence,
          failedAssumptions: [],
          reasoning: 'Validation output was not available.',
          recommendedAction: 'manual_validation_required',
        }))

    return {
      scanId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      targetPath,
      purpose:
        'Support SESIP certification code analysis by focusing on bootloader and security related source code with AI-assisted review and explicit validation.',
      motivation:
        'Mirror the Code analysis and AVA_SW_TEST.01 source analysis workflow by documenting scope, reviewed sample, validation results, and actionable developer follow-up items.',
      testedSample: scope.testedSample,
      scope,
      methodDescription: [
        'Repository scoping to discover source packages and identify security related modules.',
        'Module-level AI review for implementation vulnerabilities, security functionality, and hardware-weakness related concerns.',
        'Second-pass validation to classify findings as confirmed, partially supported, false positive, or hallucination.',
        'Markdown and JSON report generation aligned to SESIP evidence and traceability expectations.',
      ],
      resultsSummary: this.summarizeResults(initialFindings, findings),
      validatedFindings: findings,
      developerFollowUpItems: this.buildDeveloperFollowUpItems(findings),
    }
  }

  private summarizeResults(
    initialFindings: InitialFinding[],
    findings: ValidatedFinding[]
  ): ResultsSummary {
    const summary: ResultsSummary = {
      totalInitial: initialFindings.length,
      totalValidated: findings.length,
      confirmed: 0,
      partiallySupported: 0,
      falsePositive: 0,
      hallucination: 0,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      informational: 0,
      notVisible: 0,
    }

    for (const finding of findings) {
      if (finding.validationResult === 'confirmed') summary.confirmed++
      if (finding.validationResult === 'partially_supported') summary.partiallySupported++
      if (finding.validationResult === 'false_positive') summary.falsePositive++
      if (finding.validationResult === 'hallucination') summary.hallucination++

      if (finding.revisedSeverity === 'critical') summary.critical++
      if (finding.revisedSeverity === 'high') summary.high++
      if (finding.revisedSeverity === 'medium') summary.medium++
      if (finding.revisedSeverity === 'low') summary.low++
      if (finding.revisedSeverity === 'informational') summary.informational++
      if (finding.revisedSeverity === 'not_visible') summary.notVisible++
    }

    return summary
  }

  private buildDeveloperFollowUpItems(findings: ValidatedFinding[]): string[] {
    const items: string[] = []
    for (const finding of findings) {
      if (finding.validationResult === 'confirmed' || finding.revisedSeverity === 'high' || finding.revisedSeverity === 'critical') {
        items.push(`${finding.vulnId}: ${finding.fixRecommendation || 'Review remediation for this issue.'}`)
      } else if (finding.validationResult === 'partially_supported') {
        items.push(`${finding.vulnId}: collect additional architectural context to validate reachability and impact.`)
      }
    }
    if (items.length === 0) {
      items.push('No high-priority follow-up items were generated from the current scoped review.')
    }
    return items
  }

  private async buildCodeBundle(targetPath: string, files: string[]): Promise<string> {
    const parts: string[] = []
    for (const file of files.slice(0, 5)) {
      const content = await this.parser.parse(file)
      if (!content) {
        continue
      }
      const rel = relative(targetPath, file).replaceAll('\\', '/')
      parts.push(`FILE: ${rel}\n${content.slice(0, SOURCE_SNIPPET_LIMIT)}`)
    }
    return parts.join('\n\n')
  }

  private deriveModuleName(targetPath: string, filePath: string): string {
    const rel = relative(targetPath, filePath)
    const parts = rel.split(/[\\/]/).filter(Boolean)
    if (parts.length <= 1) {
      return basename(filePath)
    }
    return parts[0] === '.' ? basename(dirname(filePath)) : parts[0]
  }

  private parseArgs(args: string[]): AnalysisConfig {
    let targetPath = ''
    let outputFormat: AnalysisConfig['outputFormat'] = 'markdown'
    let outputPath: string | undefined
    let workerCount = 1
    const include: string[] = []
    let focus: AuditFocus = 'security'

    for (let i = 0; i < args.length; i++) {
      const arg = args[i]
      if (arg === '--format' && i + 1 < args.length) {
        const candidate = args[++i]?.toLowerCase()
        if (candidate === 'json' || candidate === 'markdown') {
          outputFormat = candidate
        }
      } else if (arg === '--output' && i + 1 < args.length) {
        outputPath = args[++i]
      } else if (arg === '--workers' && i + 1 < args.length) {
        workerCount = Number.parseInt(args[++i] ?? '1', 10) || 1
      } else if (arg === '--include' && i + 1 < args.length) {
        include.push(args[++i] ?? '')
      } else if (arg === '--focus' && i + 1 < args.length) {
        const candidate = args[++i]
        if (candidate === 'bootloader' || candidate === 'security' || candidate === 'all-scoped') {
          focus = candidate
        }
      } else if (!arg.startsWith('-') && !targetPath) {
        targetPath = arg
      }
    }

    return { targetPath, outputFormat, outputPath, workerCount, include, focus }
  }

  private async exportResult(
    report: CodeAnalysisReport,
    outputFormat: AnalysisConfig['outputFormat'],
    outputPath?: string
  ): Promise<Record<string, unknown>> {
    const resolvedOutputPath =
      outputPath ??
      join(report.targetPath, outputFormat === 'json' ? 'sesip-code-analysis-report.json' : DEFAULT_OUTPUT_FILE)

    if (outputFormat === 'json') {
      const exporter = new JsonExporter()
      const output = exporter.export(report)
      await writeFile(resolvedOutputPath, output, 'utf-8')
      return {
        status: 'success',
        format: 'json',
        outputFile: resolvedOutputPath,
        data: JSON.parse(output),
        summary: this.createTerminalSummary(report, resolvedOutputPath),
      }
    }

    const exporter = new MarkdownExporter()
    const output = await exporter.export(report, resolvedOutputPath)
    return {
      status: 'success',
      format: 'markdown',
      outputFile: resolvedOutputPath,
      output,
      summary: this.createTerminalSummary(report, resolvedOutputPath),
    }
  }

  private createTerminalSummary(report: CodeAnalysisReport, outputPath: string): string {
    return [
      `reviewed modules: ${report.scope.includedModules.length}`,
      `initial findings count: ${report.resultsSummary.totalInitial}`,
      `validated findings count: ${report.resultsSummary.totalValidated}`,
      `high-priority items: ${report.resultsSummary.critical + report.resultsSummary.high}`,
      `report path: ${outputPath}`,
    ].join('\n')
  }

  private updateProgress(
    context: Record<string, unknown>,
    progress: {
      phase: string
      filesScanned: number
      filesTotal: number
      runtimeMinutes: number
    }
  ): void {
    const setAppState = context.setAppState
    if (typeof setAppState !== 'function') {
      return
    }

    ;(setAppState as (updater: (prev: Record<string, unknown>) => Record<string, unknown>) => void)(
      prev => ({
        ...prev,
        codeAnalyzerProgress: {
          remainingSeconds: progress.runtimeMinutes * 60,
          filesScanned: progress.filesScanned,
          filesTotal: progress.filesTotal,
          phase: progress.phase,
          startTime:
            typeof prev.codeAnalyzerProgress === 'object' &&
            prev.codeAnalyzerProgress !== null &&
            'startTime' in prev.codeAnalyzerProgress &&
            typeof prev.codeAnalyzerProgress.startTime === 'number'
              ? prev.codeAnalyzerProgress.startTime
              : Date.now(),
          runtimeMinutes: progress.runtimeMinutes,
        },
      })
    )
  }

  private clearProgress(context: Record<string, unknown>): void {
    const setAppState = context.setAppState
    if (typeof setAppState !== 'function') {
      return
    }

    ;(setAppState as (updater: (prev: Record<string, unknown>) => Record<string, unknown>) => void)(
      prev => ({
        ...prev,
        codeAnalyzerProgress: undefined,
      })
    )
  }

  private announce(context: Record<string, unknown>, content: string): void {
    const appendSystemMessage = context.appendSystemMessage
    if (typeof appendSystemMessage === 'function') {
      ;(appendSystemMessage as (message: Message) => void)(
        createSystemMessage(`[code-analyzer] ${content}`, 'info') as Message
      )
      return
    }

    const setMessages = context.setMessages
    if (typeof setMessages !== 'function') {
      return
    }

    ;(setMessages as (updater: (prev: Message[]) => Message[]) => void)(prev => [
      ...prev,
      createSystemMessage(`[code-analyzer] ${content}`, 'info') as Message,
    ])
  }

  private getModelContext(context: Record<string, unknown>): AnalysisModelContext | undefined {
    const options = context.options
    const abortController = context.abortController
    const getAppState = context.getAppState

    if (
      !options ||
      typeof options !== 'object' ||
      !abortController ||
      !(abortController instanceof AbortController) ||
      typeof getAppState !== 'function'
    ) {
      return undefined
    }

    const typedOptions = options as AnalysisModelContext['options']
    if (
      typeof typedOptions.mainLoopModel !== 'string' ||
      typeof typedOptions.isNonInteractiveSession !== 'boolean' ||
      !typedOptions.agentDefinitions ||
      !Array.isArray(typedOptions.agentDefinitions.activeAgents)
    ) {
      return undefined
    }

    return {
      abortController,
      getAppState: getAppState as AnalysisModelContext['getAppState'],
      options: typedOptions,
      addNotification:
        typeof context.addNotification === 'function'
          ? (context.addNotification as AnalysisModelContext['addNotification'])
          : undefined,
      agentId:
        typeof context.agentId === 'string'
          ? (context.agentId as AnalysisModelContext['agentId'])
          : undefined,
    }
  }
}

export const codeAnalyzerPlugin = new CodeAnalyzerPlugin()
