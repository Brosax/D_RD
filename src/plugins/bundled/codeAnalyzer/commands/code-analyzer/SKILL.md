# Code Analyzer

Analyzes C/C++ source code for security vulnerabilities based on SESIP (Secure Element SEcurIty Evaluation PlatForm) compliance rules.

## Usage

```
/code-analyzer <path_to_code> [--format json|html] [--output <file>] [--workers <count>] [--runtime <minutes>]
```

**Options:**
- `--format json|html` - Output format (default: json)
- `--output <file>` - Write output to file
- `--workers <count>` - Number of parallel agents for analysis (default: 1)
- `--runtime <minutes>` - Maximum time to run analysis (default: 5)

## Multi-Agent Mode

When `--workers N` is specified (N > 1), use subagent-driven analysis:

### Phase 1 - File Discovery
Use Glob to find all C/C++ files in the target path:
```
Glob: <path_to_code>/**/*.{c,cpp,cxx,cc,h,hpp,hxx}
```

### Phase 2 - Spawn Worker Agents
For each file, spawn a worker agent using the Agent tool with subagent_type="general-purpose".

**Worker Agent Prompt Template:**
```
You are a security analyzer specializing in SESIP compliance auditing.

Your task: Analyze the C/C++ source file at {file_path} for security vulnerabilities.

Rules to check:
- Memory Safety: MS-001 to MS-006 (buffer overflow, use-after-free, uninitialized memory)
- Cryptography: CR-001 to CR-006 (hardcoded keys, weak algorithms)
- Input Validation: IV-001 to IV-007 (format string, injection, path traversal)
- Access Control: AC-002, AC-004, AC-005 (hardcoded credentials)
- Error Handling: EH-001 to EH-003 (information leakage)

For each vulnerability found, report:
{
  "ruleId": "e.g., MS-001",
  "title": "e.g., Buffer Overflow in Nonce Storage",
  "severity": "critical|high|medium|low",
  "confidence": "likely|possible|unclear",
  "file": "{file_path}",
  "line": <line_number>,
  "snippet": "code snippet with context",
  "description": "what the issue is and why it's dangerous",
  "remediation": "how to fix it"
}

Return your findings as a JSON array. If no issues found, return [].
```

### Phase 3 - Cross-Validation
Each file should be analyzed by at least 2 workers for accuracy:
- Worker 1: Analyze file X
- Worker 2: Analyze file X again (different worker ID)
- Deduplicate findings by file:line:ruleId

### Phase 4 - Result Aggregation
After all workers complete, aggregate findings:
- Deduplicate by (file, line, ruleId) - if same issue found by multiple agents, keep one
- Count how many agents confirmed each finding (agentCount)
- If agentCount >= 2, mark confidence as "likely"
- Generate final report

## Deduplication Algorithm

When multiple agents report the same finding:
```
uniqueKey = file:line:ruleId
if key exists:
  existing.agentCount++
  existing.reportedBy.push(agentId)
  existing.confidence = "likely" if agentCount >= 2
else:
  create new AggregatedFinding
```

## Output

Returns a JSON report containing:
- Scan ID and timestamp
- Summary of findings by severity
- Detailed findings with:
  - Vulnerability ID and title
  - Severity and confidence level
  - Evidence (file, line, code snippet)
  - agentCount: how many agents confirmed this finding
  - reportedBy: list of worker agent IDs
  - Fix recommendation and remediation steps

## Examples

```
/code-analyzer ./firmware/src --workers 3 --runtime 10
/code-analyzer ./firmware/src --format html --output report.html --workers 5
```