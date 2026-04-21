/**
 * File parser for reading and preprocessing source code.
 */

import { readFile } from 'fs/promises'

export class FileParser {
  private cache: Map<string, string> = new Map()

  async parse(filePath: string): Promise<string | null> {
    try {
      const content = await readFile(filePath, 'utf-8')
      const processed = this.preprocess(content, filePath)
      this.cache.set(filePath, processed)
      return processed
    } catch {
      return null
    }
  }

  private preprocess(content: string, filePath: string): string {
    // Remove single-line comments
    content = this.removeSingleLineComments(content)
    // Remove multi-line comments
    content = this.removeMultiLineComments(content)
    // Normalize line endings
    content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

    return content
  }

  private removeSingleLineComments(content: string): string {
    const lines: string[] = []
    let inString = false

    for (const line of content.split('\n')) {
      let result = ''
      let i = 0

      while (i < line.length) {
        const char = line[i]

        if (char === '"' && (i === 0 || line[i - 1] !== '\\')) {
          inString = !inString
          result += char
        } else if (!inString && i + 1 < line.length && line.slice(i, i + 2) === '//') {
          break
        } else {
          result += char
        }
        i++
      }
      lines.push(result)
    }

    return lines.join('\n')
  }

  private removeMultiLineComments(content: string): string {
    const result: string[] = []
    let inComment = false
    let i = 0

    while (i < content.length) {
      if (content[i] === '/' && i + 1 < content.length) {
        if (content[i + 1] === '*' && !inComment) {
          inComment = true
          i += 2
          continue
        } else if (content[i + 1] === '*' && inComment) {
          if (i + 2 < content.length && content[i + 2] === '/') {
            inComment = false
            i += 3
            continue
          }
        }
      }

      if (!inComment) {
        result.push(content[i])
      }
      i++
    }

    return result.join('')
  }

  getLinesAround(
    filePath: string,
    lineNumber: number,
    context: number = 3
  ): string {
    const content = this.cache.get(filePath)
    if (!content) {
      return ''
    }

    const lines = content.split('\n')
    const start = Math.max(0, lineNumber - context - 1)
    const end = Math.min(lines.length, lineNumber + context)
    return lines.slice(start, end).join('\n')
  }
}
