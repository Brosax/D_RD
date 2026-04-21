/**
 * Code Analyzer Builtin Plugin Registration
 */

import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import { registerBuiltinPlugin } from '../../builtinPlugins.js'
import type { BundledSkillDefinition } from '../../../skills/bundledSkills.js'
import type { ToolUseContext } from '../../../Tool.js'

// Read SKILL.md content
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function loadSkillMd(): string {
  try {
    return readFileSync(
      join(__dirname, 'commands', 'code-analyzer', 'SKILL.md'),
      'utf-8'
    )
  } catch {
    return ''
  }
}

function parseArgs(args: string): {
  targetPath: string | undefined
  outputFormat: 'json' | 'html'
  outputPath: string | undefined
  runtimeMinutes: number | undefined
  workerCount: number | undefined
} {
  const parts = args.split(/\s+/)
  let targetPath: string | undefined
  let outputFormat: 'json' | 'html' = 'json'
  let outputPath: string | undefined
  let runtimeMinutes: number | undefined
  let workerCount: number | undefined

  for (let i = 0; i < parts.length; i++) {
    const arg = parts[i]
    if (arg === '--format' && i + 1 < parts.length) {
      const format = parts[++i].toLowerCase()
      if (format === 'json' || format === 'html') {
        outputFormat = format
      }
    } else if (arg === '--output' && i + 1 < parts.length) {
      outputPath = parts[++i]
    } else if (arg === '--runtime' && i + 1 < parts.length) {
      runtimeMinutes = parseInt(parts[++i], 10)
    } else if (arg === '--workers' && i + 1 < parts.length) {
      workerCount = parseInt(parts[++i], 10)
    } else if (!arg.startsWith('-')) {
      targetPath = arg
    }
  }

  return { targetPath, outputFormat, outputPath, runtimeMinutes, workerCount }
}

const analyzeSkill: BundledSkillDefinition = {
  name: 'code-analyzer',
  description:
    'Analyze C/C++ source code for security vulnerabilities and SESIP compliance',
  argumentHint: '<path_to_code>',
  whenToUse: 'When you need to audit C/C++ firmware code for security issues',
  allowedTools: ['Glob', 'Read', 'Bash'],
  disableModelInvocation: false,
  userInvocable: true,
  isEnabled: () => true,
  getPromptForCommand: async (
    args: string,
    _context: ToolUseContext
  ): Promise<ContentBlockParam[]> => {
    const skillContent = loadSkillMd()
    if (!skillContent) {
      return [
        {
          type: 'text',
          text: `Analyze C/C++ code at path: ${args || '<path>'}`,
        },
      ]
    }

    // Parse args for workers and runtime
    const parsedArgs = parseArgs(args || '<path>')
    const runtime = parsedArgs.runtimeMinutes ?? 5
    const workers = parsedArgs.workerCount ?? 1

    // Simple variable substitution and return as content block
    const prompt = skillContent
      .replace(/\$\{args\[0\]\}/g, args || '<path>')
      .replace(/\$\{target_path\}/g, parsedArgs.targetPath || '<path>')

    return [
      {
        type: 'text',
        text: prompt,
      },
    ]
  },
}

export function registerCodeAnalyzerBuiltinPlugin(): void {
  registerBuiltinPlugin({
    name: 'code_analyzer',
    description:
      'C/C++ source code security analysis plugin for SESIP compliance. Provides /code-analyzer command for security auditing.',
    version: MACRO.VERSION,
    defaultEnabled: true,
    skills: [analyzeSkill],
  })
}
