/**
 * File discovery for C/C++ source files.
 */

import { readdir, stat } from 'fs/promises'
import { join, extname, isAbsolute } from 'path'
import type { Dirent } from 'fs'

const C_EXTENSIONS = new Set(['.c', '.cpp', '.cxx', '.cc', '.h', '.hpp', '.hxx'])

const EXCLUDE_DIRS = new Set([
  '.git',
  '.svn',
  '.hg',
  'node_modules',
  'venv',
  '.venv',
  'build',
  'dist',
  'out',
  '.idea',
  '.vscode',
])

export class FileDiscovery {
  private discoveredFiles: string[] = []

  async scan(path: string, pattern?: string): Promise<string[]> {
    this.discoveredFiles = []

    try {
      const stats = await stat(path)

      if (stats.isFile()) {
        if (this.isSourceFile(path)) {
          return [isAbsolute(path) ? path : join(process.cwd(), path)]
        }
        return []
      }

      if (stats.isDirectory()) {
        await this.scanDirectory(path, pattern)
      }
    } catch {
      // Handle permission errors or invalid paths
    }

    return this.discoveredFiles
  }

  private async scanDirectory(directory: string, pattern?: string): Promise<void> {
    let entries: Dirent[]

    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const fullPath = join(directory, entry.name)

      if (entry.isDirectory()) {
        if (!EXCLUDE_DIRS.has(entry.name)) {
          await this.scanDirectory(fullPath, pattern)
        }
      } else if (entry.isFile()) {
        if (this.isSourceFile(entry.name)) {
          if (pattern === undefined || this.matchesPattern(entry.name, pattern)) {
            this.discoveredFiles.push(fullPath)
          }
        }
      }
    }
  }

  private isSourceFile(filePath: string): boolean {
    const ext = extname(filePath).toLowerCase()
    return C_EXTENSIONS.has(ext)
  }

  private matchesPattern(fileName: string, pattern: string): boolean {
    // Simple fnmatch-style pattern matching
    const regex = this.patternToRegex(pattern)
    return regex.test(fileName)
  }

  private patternToRegex(pattern: string): RegExp {
    let regexStr = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')
    return new RegExp(`^${regexStr}$`, 'i')
  }
}
