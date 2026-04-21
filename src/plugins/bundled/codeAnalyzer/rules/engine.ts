/**
 * Rule engine for scanning source code against SESIP rules.
 */

import type { RuleMatch, SesipRule } from '../types.js'
import { sesipRules } from './sesipRules.js'

export class RuleEngine {
  private rules: SesipRule[]

  constructor(rules?: SesipRule[]) {
    this.rules = rules ?? sesipRules
  }

  scan(
    content: string,
    filePath: string,
    ruleIds?: string[]
  ): RuleMatch[] {
    const results: RuleMatch[] = []
    const lines = content.split('\n')

    for (const rule of this.rules) {
      if (ruleIds && !ruleIds.includes(rule.id)) {
        continue
      }

      for (const pattern of rule.patterns) {
        const matches = this.findPatternMatches(
          content,
          lines,
          pattern,
          rule,
          filePath
        )
        results.push(...matches)
      }
    }

    return results
  }

  private findPatternMatches(
    content: string,
    lines: string[],
    pattern: string,
    rule: SesipRule,
    filePath: string
  ): RuleMatch[] {
    const matches: RuleMatch[] = []

    try {
      const regex = new RegExp(pattern, 'gi')

      for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum]
        const match = regex.exec(line)

        if (match) {
          // Check false positives
          if (this.isFalsePositive(rule, line, match[0])) {
            continue
          }

          // Get context lines (3 lines before and after)
          const startLine = Math.max(0, lineNum - 3)
          const endLine = Math.min(lines.length, lineNum + 4)
          const contextLines = lines.slice(startLine, endLine)
          // Build snippet with line numbers
          const snippet = contextLines
            .map((l, i) => {
              const lineNo = startLine + i + 1
              const marker = lineNo === lineNum + 1 ? '> ' : '  '
              return `${marker}${String(lineNo).padStart(4)}| ${l}`
            })
            .join('\n')

          matches.push({
            ruleId: rule.id,
            title: rule.name,
            severity: rule.severity,
            confidence: this.determineConfidence(rule, line),
            description: rule.description ?? '',
            file: filePath,
            line: lineNum + 1,
            snippet,
            context: '',
            remediation: rule.remediation ?? '',
            category: rule.category,
          })
        }
      }
    } catch {
      // Invalid regex pattern, skip
    }

    return matches
  }

  private isFalsePositive(rule: SesipRule, line: string, match: string): boolean {
    if (!rule.falsePositives) {
      return false
    }

    for (const fp of rule.falsePositives) {
      if (line.includes(fp)) {
        return true
      }
    }

    return false
  }

  private determineConfidence(rule: SesipRule, line: string): string {
    // Check if context indicators are present
    if (rule.inSecurityContext) {
      const lowerLine = line.toLowerCase()
      for (const indicator of rule.inSecurityContext) {
        if (lowerLine.includes(indicator.toLowerCase())) {
          return 'likely'
        }
      }
      return 'possible'
    }

    if (rule.requiresContext) {
      return 'possible'
    }

    // Check for clear vulnerable patterns
    const lowerLine = line.toLowerCase()
    const clearPatterns = ['hardcoded', 'password', 'key', 'secret']
    for (const p of clearPatterns) {
      if (lowerLine.includes(p)) {
        return 'likely'
      }
    }

    return 'possible'
  }

  checkSesip(content: string, filePath: string): RuleMatch[] {
    return this.scan(content, filePath)
  }
}
