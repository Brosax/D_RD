/**
 * Local model client for deep code analysis via Ollama.
 */

interface LlmAnalysisResult {
  confidence: 'likely' | 'possible' | 'unclear'
  severity: 'critical' | 'high' | 'medium' | 'low' | 'informational'
  description: string
  impact?: Record<string, string>
  attackScenario?: Record<string, unknown>
  preconditions?: string[]
  remediation?: string
  verification?: Record<string, string[]>
}

export class LocalModelClient {
  private endpoint: string
  private model: string
  private available: boolean

  constructor(endpoint?: string, model: string = 'local') {
    this.endpoint = endpoint ?? 'http://localhost:11434'
    this.model = model
    this.available = false
  }

  async checkAvailability(): Promise<boolean> {
    try {
      const response = await fetch(`${this.endpoint}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      })
      this.available = response.ok
      return this.available
    } catch {
      this.available = false
      return false
    }
  }

  async analyzeContext(
    codeSnippet: string,
    context: Record<string, string>
  ): Promise<LlmAnalysisResult | null> {
    try {
      const prompt = this.buildAnalysisPrompt(codeSnippet, context)
      const response = await this.callModel(prompt)
      return this.parseAnalysisResponse(response)
    } catch {
      return null
    }
  }

  async detectPattern(
    code: string,
    patternType: string
  ): Promise<Record<string, unknown> | null> {
    if (!this.available) {
      await this.checkAvailability()
    }

    if (!this.available) {
      return null
    }

    try {
      const prompt = `Analyze this code for ${patternType} issues:

\`\`\`${code}\`\`\`

Return JSON with:
- findings: list of issues found
- severity: overall severity
- confidence: confidence level (likely/possible/unclear)
`
      const response = await this.callModel(prompt)
      return JSON.parse(response) as Record<string, unknown>
    } catch {
      return null
    }
  }

  private buildAnalysisPrompt(
    codeSnippet: string,
    context: Record<string, string>
  ): string {
    const ruleId = context.rule ?? 'unknown'
    const filePath = context.file ?? 'unknown'

    return `You are a security expert analyzing C/C++ code for SESIP compliance.

Rule triggered: ${ruleId}
File: ${filePath}

Code snippet:
\`\`\`${codeSnippet}\`\`\`

Analyze this code and return a JSON object with:
{
    "confidence": "likely" | "possible" | "unclear",
    "severity": "critical" | "high" | "medium" | "low" | "informational",
    "description": "What the issue is and why it's a concern",
    "impact": {"confidentiality": "...", "integrity": "...", "availability": "..."},
    "attack_scenario": {"entry_point": "...", "trigger_steps": [...]},
    "preconditions": ["list of required conditions"],
    "remediation": "How to fix this issue",
    "verification": {"tests": [], "code_checks": [], "runtime_checks": []}
}

If no issue found, return:
{"confidence": "unlikely", "severity": "informational", "description": "Code appears safe", "remediation": ""}
`
  }

  private async callModel(prompt: string): Promise<string> {
    const payload = {
      model: this.model,
      prompt,
      stream: false,
      options: { temperature: 0.1, num_predict: 512 },
    }

    const response = await fetch(`${this.endpoint}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60000),
    })

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`)
    }

    const data = (await response.json()) as { response?: string }
    return data.response ?? ''
  }

  private parseAnalysisResponse(response: string): LlmAnalysisResult | null {
    try {
      // Try to extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as LlmAnalysisResult
      }
    } catch {
      // Fall through to fallback
    }

    // Fallback: create finding from raw response
    return {
      confidence: 'possible',
      severity: 'medium',
      description: response.slice(0, 500),
      remediation: 'Review manually',
    }
  }
}
