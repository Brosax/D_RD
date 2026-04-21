---
name: code-analyzer
description: Analyze C/C++ source code for security vulnerabilities, code quality issues, and SESIP compliance using multi-round AI verification
---

# Code Analyzer

Security analysis skill for C/C++ hardware firmware code with AI-powered multi-round verification.

## Usage

```
/analyze <path_to_code> [--rules <rules>] [--severity <level>] [--format <json|html|pdf>]
```

## Arguments

- `path_to_code` (required): Local path to source code directory or file

## Options

- `--rules`: Comma-separated rule categories (security, sesip, quality)
- `--severity`: Filter by severity (critical, high, medium, low)
- `--format`: Output format (json, html, pdf)

## Analysis Workflow

### Round 1: Discovery

1. Use `Glob` to find all C/C++ files in the target path
2. Use `Read` to read file contents
3. Identify file structure and entry points

### Round 2: Rule Engine Scan

Use the `scanner` and `rules` tools to perform pattern-based detection:

1. **Memory Safety (MS-*)**: Buffer overflow, use-after-free, uninitialized memory
2. **Cryptography (CR-*)**: Hardcoded keys, weak algorithms, predictable random
3. **Input Validation (IV-*)**: Format string, injection, path traversal
4. **Access Control (AC-*)**: Hardcoded credentials, insecure permissions
5. **Error Handling (EH-*)**: Information leakage, missing error handling
6. **Secure Coding (SC-*)**: TODO/FIXME in security code, magic numbers

### Round 3: Deep Analysis

For suspicious findings, use the local model to:
1. Analyze context around matches
2. Verify data flow reachability
3. Check for false positives
4. Assess exploitability

### Round 4: Result Compilation

Compile findings with:
- Evidence: file path, line number, code snippet
- Severity: critical/high/medium/low/informational
- Confidence: likely/possible/unclear
- Remediation recommendation

## Output Format

Generate report in requested format:
- **JSON**: Structured data for AI consumption
- **HTML**: Human-readable report with severity highlighting
- **PDF**: Formal report for存档

## Anti-Hallucination Rules

1. **Only claim what you can prove**: File paths + symbols + exact evidence
2. **Clear separation**: Observed facts | Inferences (marked) | Hypotheses
3. **Label all findings**: Likely / Possible / Unclear + rationale
4. **Never infer implementation from naming alone**
5. **If not visible, say "Not visible"** and list what's needed

## Example

```
/analyze ./firmware --rules security --severity high --format html
```

## Technical Details

- Supported languages: C, C++, CXX, H, HPP
- Default rules: All SESIP security categories
- Local model: Optional for deep analysis (graceful fallback)
- Privacy: All analysis performed locally, no code uploaded