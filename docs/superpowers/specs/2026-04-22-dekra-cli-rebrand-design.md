# Dekra CLI 品牌重命名设计

## Context

将 Claude Code 重命名为企业内部使用的 AI 辅助工具 Dekra CLI。仅修改用户可见的输出文本（CLI 帮助、错误信息、版本输出），不修改包名、环境变量、内部标识符。

## 范围

- **修改**：直接输出到终端的用户可见字符串
- **不修改**：包名、环境变量名（CLAUDE_CODE_*）、feature flag、内部函数名/类型名、npm 依赖、README/CLAUDE.md 文档

## 修改清单

### 1. 版本输出 — `src/entrypoints/cli.tsx`
- 第 79 行：`${MACRO.VERSION} (Claude Code)` → `${MACRO.VERSION} (Dekra CLI)`

### 2. Bridge/Remote Control — `src/bridge/bridgeMain.ts`
- 帮助文本中的 `claude.ai/code` 改为 `Dekra CLI web`
- `Run \`claude\`` → `Run \`dekra\``（二进制命令提示）
- `claude` 命令示例保留
- 错误信息中的 `Claude Code` → `Dekra CLI`

### 3. Template Jobs — `src/cli/handlers/templateJobs.ts`
- 帮助文本命令示例保留 `claude job`，产品描述改为 `Dekra CLI`

### 4. MCP — `src/cli/handlers/mcp.tsx`
- 帮助文本命令示例保留 `claude mcp`，产品描述改为 `Dekra CLI`

### 5. Background Sessions — `src/cli/bg.ts`
- 帮助文本命令示例保留 `claude daemon`，产品描述改为 `Dekra CLI`

### 6. Rollback — `src/cli/rollback.ts`
- 帮助文本命令示例保留 `claude update`，产品描述改为 `Dekra CLI`

### 7. Theme Picker — `src/components/ThemePicker.tsx`
- 第 167 行：`"Hello, Claude!"` → `"Hello, Dekra!"`

## 验证

1. `bun run dev` — 启动画面确认无 "Claude Code" 字眼
2. `claude --version` — 确认输出 `(Dekra CLI)`
3. `claude help`、`claude mcp --help`、`claude daemon --help` — 确认帮助文本无 "Claude Code"
4. `bun run typecheck` — 零错误
5. `bun test` — 全部通过
