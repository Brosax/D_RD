# Dekra CLI 品牌重命名实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将用户可见文本中的 "Claude Code" 替换为 "Dekra CLI"，仅修改直接输出到终端的字符串。

**Architecture:** 逐文件修改用户可见字符串，包括版本输出、帮助文本、错误信息、示例代码。不涉及包名、环境变量或内部标识符。

**Tech Stack:** TypeScript, Ink (React-like CLI UI framework)

---

### Task 1: 版本输出 — `cli.tsx`

**Files:**
- Modify: `src/entrypoints/cli.tsx:79`

- [ ] **Step 1: 修改版本输出**

查找第 79 行：`${MACRO.VERSION} (Claude Code)`，替换为 `${MACRO.VERSION} (Dekra CLI)`

- [ ] **Step 2: 验证**

运行 `cd claude-code && grep -n "Dekra CLI" src/entrypoints/cli.tsx`，确认替换成功。

---

### Task 2: Bridge/Remote Control 帮助文本 — `bridgeMain.ts`

**Files:**
- Modify: `src/bridge/bridgeMain.ts`（多处）

需要修改的具体字符串（通过 Grep 确认精确位置）:
- 帮助文本中 `claude.ai/code` → `Dekra CLI web`
- `Run \`claude\`` → `Run \`dekra\``（命令提示）
- 错误信息中 `Claude Code` → `Dekra CLI`

- [ ] **Step 1: 用 Grep 定位所有需要修改的字符串**

运行 `grep -n "Claude Code\|claude\.ai\|Run \`claude\`" src/bridge/bridgeMain.ts`，记录所有行号和原始字符串。

- [ ] **Step 2: 逐行修改**

对每处用户可见字符串进行替换。

- [ ] **Step 3: 验证**

运行 `grep -n "Claude Code" src/bridge/bridgeMain.ts`，确认无遗漏。

---

### Task 3: Template Jobs 帮助文本 — `templateJobs.ts`

**Files:**
- Modify: `src/cli/handlers/templateJobs.ts`

- [ ] **Step 1: 用 Grep 定位所有 "Claude Code" 字符串**

运行 `grep -n "Claude Code\|claude" src/cli/handlers/templateJobs.ts`，区分用户可见文本和内部代码。

- [ ] **Step 2: 修改用户可见文本**

仅修改帮助文本中显示给用户的部分（`console.log`、return 字符串等），不修改变量名或函数名。

- [ ] **Step 3: 验证**

运行 `grep -n "Claude Code" src/cli/handlers/templateJobs.ts`，确认无遗漏。

---

### Task 4: MCP 帮助文本 — `mcp.tsx`

**Files:**
- Modify: `src/cli/handlers/mcp.tsx`

- [ ] **Step 1: 用 Grep 定位所有 "Claude Code" 字符串**

运行 `grep -n "Claude Code\|claude" src/cli/handlers/mcp.tsx`，区分用户可见文本。

- [ ] **Step 2: 修改用户可见文本**

仅修改帮助文本中显示给用户的部分。

- [ ] **Step 3: 验证**

运行 `grep -n "Claude Code" src/cli/handlers/mcp.tsx`，确认无遗漏。

---

### Task 5: Background Sessions 帮助文本 — `bg.ts`

**Files:**
- Modify: `src/cli/bg.ts`

- [ ] **Step 1: 用 Grep 定位所有 "Claude Code" 字符串**

运行 `grep -n "Claude Code\|claude" src/cli/bg.ts`

- [ ] **Step 2: 修改用户可见文本**

- [ ] **Step 3: 验证**

运行 `grep -n "Claude Code" src/cli/bg.ts`，确认无遗漏。

---

### Task 6: Rollback 帮助文本 — `rollback.ts`

**Files:**
- Modify: `src/cli/rollback.ts`

- [ ] **Step 1: 用 Grep 定位所有 "Claude Code" 字符串**

运行 `grep -n "Claude Code\|claude" src/cli/rollback.ts`

- [ ] **Step 2: 修改用户可见文本**

- [ ] **Step 3: 验证**

运行 `grep -n "Claude Code" src/cli/rollback.ts`，确认无遗漏。

---

### Task 7: Theme Picker 示例代码 — `ThemePicker.tsx`

**Files:**
- Modify: `src/components/ThemePicker.tsx:167`

- [ ] **Step 1: 修改示例代码**

第 167 行：`"Hello, Claude!"` → `"Hello, Dekra!"`

- [ ] **Step 2: 验证**

运行 `grep -n "Hello, Claude" src/components/ThemePicker.tsx`，确认无 "Claude" 字眼。

---

### Task 8: 全局验证

- [ ] **Step 1: 运行 typecheck**

运行 `cd claude-code && bun run typecheck`，确认零错误。

- [ ] **Step 2: 搜索遗漏的用户可见字符串**

运行 `grep -rn "Claude Code" src/ --include="*.tsx" --include="*.ts" | grep -v "test\|spec\|\.d\.ts"`，检查是否有遗漏的用户可见引用。

- [ ] **Step 3: 提交**

```bash
git add -A && git commit -m "feat: rebrand user-facing text to Dekra CLI"
```
