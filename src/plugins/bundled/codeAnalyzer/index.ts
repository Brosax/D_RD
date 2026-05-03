/**
 * Code Analyzer Builtin Plugin Registration
 */

import { registerBuiltinPlugin } from '../../builtinPlugins.js'
import type { Command, LocalCommandCall } from '../../../types/command.js'

function parseCommandArgs(args: string): string[] {
  if (!args.trim()) {
    return []
  }

  const tokens = args.match(/"[^"]*"|'[^']*'|\S+/g) ?? []
  return tokens.map(token => {
    if (
      (token.startsWith('"') && token.endsWith('"')) ||
      (token.startsWith("'") && token.endsWith("'"))
    ) {
      return token.slice(1, -1)
    }
    return token
  })
}

const analyzeCommandCall: LocalCommandCall = async (args, context) => {
  const { codeAnalyzerPlugin } = await import('./CodeAnalyzerPlugin.js')
  const result = await codeAnalyzerPlugin.execute(parseCommandArgs(args), context)

  if (result.status !== 'success') {
    return {
      type: 'text',
      value:
        typeof result.message === 'string'
          ? result.message
          : 'Code analysis failed.',
    }
  }

  if (result.format === 'json') {
    const outputFile =
      typeof result.outputFile === 'string' && result.outputFile.length > 0
        ? result.outputFile
        : undefined
    return {
      type: 'text',
      value: outputFile
        ? `JSON report written to ${outputFile}`
        : JSON.stringify(result.data, null, 2),
    }
  }

  if (result.format === 'markdown') {
    const outputFile =
      typeof result.outputFile === 'string' && result.outputFile.length > 0
        ? result.outputFile
        : undefined

    return {
      type: 'text',
      value: outputFile
        ? `SESIP report written to ${outputFile}`
        : typeof result.output === 'string'
          ? result.output
          : 'SESIP report generated successfully.',
    }
  }

  return {
    type: 'text',
    value: JSON.stringify(result, null, 2),
  }
}

const analyzeCommand = {
  type: 'local',
  name: 'code-analyzer',
  description:
    'Run SESIP-oriented code analysis for bootloader and security related source code',
  argumentHint: '<path_to_code>',
  supportsNonInteractive: true,
  isEnabled: () => true,
  load: () => Promise.resolve({ call: analyzeCommandCall }),
} satisfies Command

export function registerCodeAnalyzerBuiltinPlugin(): void {
  registerBuiltinPlugin({
    name: 'code_analyzer',
    description:
      'C/C++ source code security analysis plugin for SESIP compliance. Provides /code-analyzer command for security auditing.',
    version: MACRO.VERSION,
    defaultEnabled: true,
    commands: [analyzeCommand],
  })
}
