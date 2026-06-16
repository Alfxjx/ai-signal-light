# 打包与发布自动化实施计划

> **For agentic workers:** 使用 `superpowers:subagent-driven-development` 或 `superpowers:executing-plans` 逐步执行。若当前环境无这些子技能，可用常规 `Agent` 工具分任务执行，或在当前会话中按步骤完成。

**Goal:** 为 Electron 项目搭建一键发布流程：本地 `npm run release` 自动 bump 版本、生成 CHANGELOG、打 tag 并推送；GitHub Actions 收到 tag 后自动创建 Release 并上传当前平台安装包。

**Architecture:** 本地使用 `commit-and-tag-version` 管理版本号与 changelog；CI 使用单一 workflow，支持 `tag push` 自动触发和 `workflow_dispatch` 手动选择平台；产物通过 `softprops/action-gh-release` 上传到 GitHub Release。

**Tech Stack:** Node.js 20, npm, commit-and-tag-version, electron-builder, GitHub Actions

---

## 文件变更总览

| 文件 | 操作 | 说明 |
|---|---|---|
| `package.json` | 修改 | 新增 `release` / `release:dry-run` scripts，补充 `repository` 字段 |
| `package-lock.json` | 修改 | 安装新依赖后自动更新 |
| `.versionrc.json` | 创建 | 配置 conventional commits 类型、changelog 格式、tag 前缀 |
| `.github/workflows/release.yml` | 创建 | GitHub Actions 发布工作流 |
| `AGENTS.md` | 修改 | 补充发布相关命令说明 |

---

### Task 1: 补充 package.json 仓库信息

**Files:**
- Modify: `package.json:23-24`

**说明：** `commit-and-tag-version` 生成 changelog 链接需要 `package.json` 的 `repository` 字段。请替换为实际仓库地址。

- [ ] **Step 1: 编辑 package.json 添加 repository**

```json
{
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/<owner>/ai-assistant-status-monitor.git"
  },
  "devDependencies": {
```

- [ ] **Step 2: 暂存并提交**

```bash
git add package.json
git commit -m "chore: add repository field to package.json"
```

---

### Task 2: 安装 commit-and-tag-version

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: 安装开发依赖**

```bash
npm install -D commit-and-tag-version
```

- [ ] **Step 2: 确认安装成功**

Run:
```bash
npx commit-and-tag-version --version
```

Expected: 输出版本号，例如 `12.5.0`

- [ ] **Step 3: 提交依赖变更**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add commit-and-tag-version"
```

---

### Task 3: 创建 .versionrc.json

**Files:**
- Create: `.versionrc.json`

- [ ] **Step 1: 写入配置文件**

```json
{
  "types": [
    { "type": "feat", "section": "✨ 新功能" },
    { "type": "fix", "section": "🐛 修复" },
    { "type": "docs", "section": "📝 文档" },
    { "type": "style", "section": "💄 样式" },
    { "type": "refactor", "section": "♻️ 重构" },
    { "type": "perf", "section": "⚡ 性能优化" },
    { "type": "test", "section": "✅ 测试" },
    { "type": "chore", "section": "🔧 构建/工具", "hidden": true },
    { "type": "ci", "section": "👷 CI", "hidden": true }
  ],
  "commitUrlFormat": "{{host}}/{{owner}}/{{repository}}/commit/{{hash}}",
  "compareUrlFormat": "{{host}}/{{owner}}/{{repository}}/compare/{{previousTag}}...{{currentTag}}",
  "releaseCommitMessageFormat": "chore(release): {{currentTag}}",
  "tagPrefix": "v"
}
```

- [ ] **Step 2: 暂存并提交**

```bash
git add .versionrc.json
git commit -m "chore(release): add versionrc config"
```

---

### Task 4: 添加 npm scripts

**Files:**
- Modify: `package.json:6-15`

- [ ] **Step 1: 在 scripts 中新增 release 命令**

```json
"scripts": {
  "dev": "concurrently -k -n VITE,ELECTRON -c blue,green \"vite\" \"wait-on http://localhost:5173 && electron dist/main/main.js --dev\"",
  "start": "npm run build:main && npm run build:renderer && electron dist/main/main.js",
  "build:main": "tsc -p tsconfig.main.json",
  "build:renderer": "vue-tsc --noEmit && vite build && node scripts/copy-renderer-assets.js",
  "build": "npm run build:main && npm run build:renderer && electron-builder",
  "typecheck": "vue-tsc --noEmit && tsc -p tsconfig.main.json --noEmit",
  "test": "vitest run",
  "test:watch": "vitest",
  "release:dry-run": "commit-and-tag-version --dry-run",
  "release": "commit-and-tag-version"
}
```

- [ ] **Step 2: 暂存并提交**

```bash
git add package.json
git commit -m "chore(release): add release npm scripts"
```

---

### Task 5: 创建 GitHub Actions 发布工作流

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: 创建工作流目录**

```bash
mkdir -p .github/workflows
```

- [ ] **Step 2: 写入 release.yml**

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:
    inputs:
      tag:
        description: '要重新构建的 tag（如 v1.1.0）'
        required: true
        type: string
      platform:
        description: '目标平台'
        required: true
        default: 'windows-latest'
        type: choice
        options:
          - windows-latest
          - macos-latest
          - ubuntu-latest

jobs:
  release:
    runs-on: ${{ github.event.inputs.platform || 'windows-latest' }}
    permissions:
      contents: write
    steps:
      - name: Checkout tag
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
          ref: ${{ github.event.inputs.tag || github.ref_name }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Type check
        run: npm run typecheck

      - name: Build application
        run: npm run build

      - name: Extract release notes from CHANGELOG
        id: changelog
        shell: bash
        run: |
          TAG="${{ github.event.inputs.tag || github.ref_name }}"
          VERSION="${TAG#v}"
          awk -v ver="## \\[${VERSION}\\]" '
            $0 ~ ver { flag=1; next }
            flag && /^## \[/ { exit }
            flag { print }
          ' CHANGELOG.md > RELEASE_NOTES.md || true
          [ -s RELEASE_NOTES.md ] || echo "Release notes for ${TAG}" > RELEASE_NOTES.md

      - name: Upload artifacts to GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: ${{ github.event.inputs.tag || github.ref_name }}
          name: ${{ github.event.inputs.tag || github.ref_name }}
          body_path: RELEASE_NOTES.md
          files: |
            dist/*.exe
            dist/*.dmg
            dist/*.AppImage
          generate_release_notes: false
          prerelease: ${{ contains(github.event.inputs.tag || github.ref_name, '-') }}
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 3: 暂存并提交**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add release workflow"
```

---

### Task 6: 更新 AGENTS.md 发布命令说明

**Files:**
- Modify: `AGENTS.md:9-18`

- [ ] **Step 1: 在 Commands 表格后补充发布命令**

```markdown
| 任务 | 命令 | 备注 |
|------|---------|-------|
| 安装 deps | `npm install` | One-time setup |
| Dev mode (with DevTools) | `npm run dev` | Passes `--dev` flag to main process |
| Production run | `npm start` | `electron .` |
| Package for distribution | `npm run build` | Uses electron-builder → `dist/` (nsis/dmg/AppImage) |
| Run a single script | `node scripts/status-reporter.js --watch` | Cross-platform status reporter (see below) |
| 预览发布 | `npm run release:dry-run` | 只读，输出版本号和 changelog 预览 |
| 正式发布 | `npm run release` | 自动 bump、生成 CHANGELOG、打 tag、推送 |
```

- [ ] **Step 2: 暂存并提交**

```bash
git add AGENTS.md
git commit -m "docs(agents): document release commands"
```

---

### Task 7: 本地 dry-run 测试

**Files:**
- 无新文件

- [ ] **Step 1: 确保工作区干净**

```bash
git status
```

Expected: 无未暂存/未提交的变更（除本计划实施中的变更外，应先提交前面任务）。

- [ ] **Step 2: 运行 dry-run**

```bash
npm run release:dry-run
```

Expected: 输出类似以下内容（具体版本号取决于当前 commit 历史）：

```
✔ bumping version in package.json from 1.0.0 to 1.1.0
✔ outputting changes to CHANGELOG.md

---

### ✨ 新功能

* 添加缩略浮窗功能

### 🐛 修复

* 修复 resetTime 更新问题
```

- [ ] **Step 3: 确认无文件被修改**

```bash
git status
```

Expected: `package.json`、`CHANGELOG.md` 等未被修改。

---

### Task 8: 本地构建验证

**Files:**
- 无新文件

- [ ] **Step 1: 运行完整构建**

```bash
npm run build
```

Expected: 构建成功，`dist/` 下生成当前平台安装包（Windows 下为 `.exe`）。

- [ ] **Step 2: 检查产物**

Run (Windows):
```bash
ls dist/*.exe
```

Expected: 输出类似 `dist/AI状态监控 1.0.0.exe`

---

### Task 9: 推送配置变更

**Files:**
- 已修改的 `package.json`
- 已修改的 `package-lock.json`
- 已创建的 `.versionrc.json`
- 已创建的 `.github/workflows/release.yml`
- 已修改的 `AGENTS.md`

- [ ] **Step 1: 确认当前分支和提交历史**

```bash
git log --oneline -10
```

Expected: 能看到 Task 1-8 产生的相关提交，且无未提交变更。

- [ ] **Step 2: 推送变更**

```bash
git push origin v1.0
```

Expected: 推送成功，无冲突。

---

### Task 10: 可选——执行首次真实发布（沙盒验证后）

**Files:**
- 无新文件

**说明：** 本任务在主仓库执行前，建议先在 fork 或个人测试仓库跑通一次完整流程。

- [ ] **Step 1: 再次 dry-run 确认**

```bash
npm run release:dry-run
```

- [ ] **Step 2: 执行正式发布**

```bash
npm run release
```

Expected:
- `package.json` / `package-lock.json` 版本号更新
- `CHANGELOG.md` 生成/更新
- 自动创建 `chore(release): vX.X.X` commit
- 自动打 `vX.X.X` tag
- 自动 push commit 和 tag

- [ ] **Step 3: 验证 GitHub Actions 运行**

前往 GitHub 仓库的 Actions 页面，确认 `Release` workflow 被 tag push 触发，且成功完成。

- [ ] **Step 4: 验证 GitHub Release**

前往 GitHub 仓库的 Releases 页面，确认：
- Release 标题为 tag 名
- Release 说明来自 `CHANGELOG.md`
- 附件包含当前平台安装包

---

## 自审检查

### Spec 覆盖

| Spec 要求 | 对应任务 |
|---|---|
| 本地一键 bump + changelog + tag + push | Task 2, 3, 4, 10 |
| GitHub Actions 收到 tag 后创建 Release | Task 5, 10 |
| 支持 dry-run 预览 | Task 4, 7 |
| CI 平台可配置 | Task 5 |
| 产物上传到 Release | Task 5, 10 |
| 更新项目文档 | Task 6 |

### Placeholder 扫描

- 无 TBD / TODO。
- 仓库地址 `<owner>` 在 Task 1 中明确标注需替换为实际值。
- 所有代码块均为可直接使用的完整内容。

### 一致性检查

- `tagPrefix` 统一为 `v`。
- Workflow 中 tag 解析统一使用 `${TAG#v}` 去除前缀。
- npm scripts 与 AGENTS.md 中命令名称一致。
