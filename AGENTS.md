# Agent Instructions for claude-code-best

This repository is a reverse-engineered version of Anthropic's Claude Code CLI. Read these instructions carefully to avoid common mistakes.

## Tooling & Workflows
- **Runtime**: This is a **Bun** project, NOT Node.js. Use `bun` for everything.
- **Install**: `bun install`
- **Test**: `bun test` (to run a single test, use `bun test <path-to-file>`)
- **Lint/Format**: `bun run lint:fix` and `bun run format` (uses Biome)
- **Typecheck**: `bun run typecheck`. **CRITICAL:** `tsc` must pass with zero errors. Run this before finishing any task.
- **Dev mode**: `bun run dev` (Runs `cli.tsx` and injects macros via `-d` flag)

## Architecture Notes
- **Monorepo**: This is a Bun workspace. Core CLI is in `src/`, sub-packages are in `packages/`.
- **Ink UI Framework**: The Ink UI components, hooks, and themes are located in `packages/@ant/ink/`. **There is no `src/ink/` directory.**
- **Macros**: Constants like `MACRO.VERSION` are defined in `scripts/defines.ts`. Do not modify them in the source code files.

## Feature Flags (Crucial)
Features are gated using Bun's built-in macro system.
- Import: `import { feature } from 'bun:bundle';`
- **Restriction**: You MUST use `feature('FLAG_NAME')` directly in an `if` statement or ternary expression.
  - ✅ Correct: `if (feature('VOICE_MODE')) { ... }`
  - ✅ Correct: `const val = feature('VOICE_MODE') ? a : b;`
  - ❌ Incorrect: `const isVoice = feature('VOICE_MODE'); if (isVoice) ...` (Will fail Bun's compiler constraints)
- Do NOT redefine the `feature` function.

## Testing Rules
- **Mocking**: Only mock side effects (e.g., file system, network, `log.ts`, `debug.ts`). 
- **NEVER** mock pure functions or data structures.
- Do not double-mock the same module. Use exact `.ts` extensions and `src/*` aliases for mock paths.

## TypeScript Rules
- Avoid `as any` in production code (allowable in test mocks).
- If types mismatch, use type guards to narrow or `as unknown as SpecificType` as a last resort.
- When dealing with unknown structures, use `Record<string, unknown>` instead of `any`.