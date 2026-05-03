# Code Analyzer

Runs a manual SESIP certification-support code analysis workflow.

## Usage

```text
/code-analyzer <path_to_code> [--format markdown|json] [--output <file>] [--workers <count>] [--include <path-or-glob>] [--focus <bootloader|security|all-scoped>]
```

## Workflow

1. Discover source packages.
2. Identify security related modules.
3. Build tested sample summary.
4. Review each scoped module with AI assistance.
5. Validate findings for false positives and hallucinations.
6. Write Markdown or JSON certification-style report.

## Output

Default output is Markdown. The report contains:

- Purpose / Motivation
- Tested Sample
- Scope and Coverage
- Description of Analysis Method
- Results Summary
- Findings by severity
- Findings by SESIP control area
- Validation / False-positive review
- Developer follow-up items
