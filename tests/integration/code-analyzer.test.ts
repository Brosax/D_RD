import { afterEach, describe, expect, mock, test } from 'bun:test'
import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { CodeAnalyzerPlugin } from '../../src/plugins/bundled/codeAnalyzer/CodeAnalyzerPlugin.js'
import {
  LocalModelClient,
  type AnalysisModelContext,
} from '../../src/plugins/bundled/codeAnalyzer/llm/localClient.js'
import { FileParser } from '../../src/plugins/bundled/codeAnalyzer/scanner/fileParser.js'

const tempRoots: string[] = []

function createAnalyzerContext(): AnalysisModelContext {
  return {
    abortController: new AbortController(),
    getAppState: () => ({
      advisorModel: null,
      effortValue: undefined,
      mcp: {
        tools: [],
        clients: [],
      },
    }),
    options: {
      agentDefinitions: {
        activeAgents: [],
      },
      isNonInteractiveSession: true,
      mainLoopModel: 'claude-sonnet-4-6',
      querySource: 'test:code-analyzer',
    },
  }
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map(path => rm(path, { recursive: true, force: true })))
  mock.restore()
})

describe('code analyzer: file parser', () => {
  test('removes multi-line comments while preserving comment markers in strings', async () => {
    const root = join(tmpdir(), `code-analyzer-parser-${Date.now()}`)
    tempRoots.push(root)
    await mkdir(root, { recursive: true })
    const filePath = join(root, 'sample.c')
    await writeFile(
      filePath,
      'const char* s = "/* keep */";\n/* remove me */\nint x = 1; // trailing\n',
      'utf-8'
    )

    const parser = new FileParser()
    const parsed = await parser.parse(filePath)

    expect(parsed).toContain('const char* s = "/* keep */";')
    expect(parsed).not.toContain('remove me')
    expect(parsed).not.toContain('trailing')
  })
})

describe('code analyzer: SESIP workflow', () => {
  test('builds validated findings and scoped report summary', async () => {
    const root = join(tmpdir(), `code-analyzer-sesip-${Date.now()}`)
    tempRoots.push(root)
    await mkdir(join(root, 'bootloader'), { recursive: true })
    await mkdir(join(root, 'app'), { recursive: true })
    await writeFile(
      join(root, 'bootloader', 'verify.c'),
      'int verify_image(const char *buf) { strcpy(tmp, buf); return 0; }',
      'utf-8'
    )
    await writeFile(join(root, 'app', 'ui.c'), 'int draw(void) { return 0; }', 'utf-8')

    let callCount = 0
    const llmClient = new LocalModelClient(
      mock(async () => {
        callCount++
        return {
          type: 'assistant',
          message: {
            content: [
              {
                type: 'text',
                text:
                  callCount === 1
                    ? JSON.stringify({
                        findings: [
                          {
                            title: 'Unsafe boot image copy',
                            confidence: 'likely',
                            severity: 'high',
                            severity_rationale: 'Unbounded copy in bootloader path.',
                            description: 'Bootloader copies attacker-influenced image data with strcpy.',
                            observed_facts: ['verify_image calls strcpy on incoming buffer'],
                            inferences: ['buffer length is not bounded in visible code'],
                            hypotheses: [],
                            evidence: [
                              {
                                file: 'bootloader/verify.c',
                                lines: '1',
                                snippet: 'int verify_image(const char *buf) { strcpy(tmp, buf); return 0; }',
                              },
                            ],
                            files_affected: ['bootloader/verify.c'],
                            attack_scenario: {
                              untrusted_inputs: ['firmware image buffer'],
                              entry_point: 'verify_image',
                              trigger_steps: ['submit crafted buffer', 'reach strcpy'],
                            },
                            impact: {
                              confidentiality: 'low',
                              integrity: 'high',
                              availability: 'medium',
                              scope_notes: 'Boot path corruption may block trusted boot.',
                            },
                            preconditions: ['attacker controls update payload'],
                            reproduction: { level: 'code_review', steps: ['trace buf into strcpy'] },
                            fix_recommendation: 'Replace strcpy with bounded copy.',
                            patch_direction: 'Add length validation before copy.',
                            verification: {
                              tests: ['fuzz image verification'],
                              code_checks: ['confirm bounded copy API'],
                              runtime_checks: [],
                            },
                            tags: ['MS-001'],
                            sesip_control_area: 'Memory Safety',
                          },
                        ],
                      })
                    : JSON.stringify({
                        findings: [
                          {
                            validation_result: 'confirmed',
                            revised_confidence: 'likely',
                            revised_severity: 'high',
                            evidence_validated: [
                              {
                                file: 'bootloader/verify.c',
                                lines: '1',
                                snippet: 'int verify_image(const char *buf) { strcpy(tmp, buf); return 0; }',
                                status: 'exists',
                              },
                            ],
                            failed_assumptions: [],
                            reasoning: 'The visible bootloader path contains an unbounded copy in a security-relevant function.',
                            recommended_action: 'keep_as_finding',
                          },
                        ],
                      }),
              },
            ],
          },
        }
      }) as typeof import('../../src/services/api/claude.js').queryWithModel
    )

    const plugin = new CodeAnalyzerPlugin(llmClient)
    const result = await plugin.execute([root], createAnalyzerContext())

    expect(result.status).toBe('success')
    expect(result.format).toBe('markdown')
    expect(String(result.summary)).toContain('reviewed modules: 1')
    expect(String(result.output)).toContain('## Purpose / Motivation')
    expect(String(result.output)).toContain('Unsafe boot image copy')
    expect(String(result.output)).toContain('Validation result: confirmed')
  })

  test('writes json output with SESIP report structure', async () => {
    const root = join(tmpdir(), `code-analyzer-json-${Date.now()}`)
    tempRoots.push(root)
    await mkdir(join(root, 'security'), { recursive: true })
    const outputPath = join(root, 'report.json')
    await writeFile(
      join(root, 'security', 'crypto.c'),
      'int verify_sig(const char *sig) { return strcmp(sig, "ok"); }',
      'utf-8'
    )

    let callCount = 0
    const llmClient = new LocalModelClient(
      mock(async () => {
        callCount++
        return {
          type: 'assistant',
          message: {
            content: [
              {
                type: 'text',
                text:
                  callCount === 1
                    ? JSON.stringify({
                        findings: [],
                      })
                    : JSON.stringify({
                        findings: [],
                      }),
              },
            ],
          },
        }
      }) as typeof import('../../src/services/api/claude.js').queryWithModel
    )

    const plugin = new CodeAnalyzerPlugin(llmClient)
    const result = await plugin.execute(
      [root, '--format', 'json', '--output', outputPath, '--include', 'security'],
      createAnalyzerContext()
    )

    expect(result.status).toBe('success')
    expect(result.outputFile).toBe(outputPath)
    const output = await readFile(outputPath, 'utf-8')
    expect(output).toContain('"tested_sample"')
    expect(output).toContain('"description_of_analysis_method"')
    expect(output).toContain('"developer_follow_up_items"')
  })

  test('supports bootloader focus and excludes unrelated modules', async () => {
    const root = join(tmpdir(), `code-analyzer-focus-${Date.now()}`)
    tempRoots.push(root)
    await mkdir(join(root, 'bootloader'), { recursive: true })
    await mkdir(join(root, 'drivers'), { recursive: true })
    await writeFile(join(root, 'bootloader', 'main.c'), 'int boot(void) { return 0; }', 'utf-8')
    await writeFile(join(root, 'drivers', 'lcd.c'), 'int lcd(void) { return 0; }', 'utf-8')

    const llmClient = new LocalModelClient(
      mock(async () => ({
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: JSON.stringify({ findings: [] }) }],
        },
      })) as typeof import('../../src/services/api/claude.js').queryWithModel
    )

    const plugin = new CodeAnalyzerPlugin(llmClient)
    const result = await plugin.execute([root, '--focus', 'bootloader'], createAnalyzerContext())

    expect(result.status).toBe('success')
    expect(String(result.output)).toContain('Included modules:')
    expect(String(result.output)).toContain('bootloader')
    expect(String(result.output)).toContain('Excluded modules:')
    expect(String(result.output)).toContain('drivers')
  })
})
