# 打包与发布自动化设计文档

## 背景

`ai-assistant-status-monitor`（产品名：AI状态监控）是一款 Electron 桌面应用。当前项目已通过 `electron-builder` 实现本地打包，但缺乏系统化的发布流程：

- 没有版本号自动管理机制
- 没有 CHANGELOG
- 没有 GitHub Releases 工作流
- 每次发布需要手动改版本、手动上传产物

本设计旨在搭建「一行命令即可完成版本升级、生成 changelog、打 tag 并触发 GitHub Release」的自动化发布流程。

## 目标

1. 本地只需一条命令即可完成：版本号自动推断、CHANGELOG 生成、git commit、git tag、推送 tag。
2. GitHub Actions 在收到 tag 推送后自动创建 GitHub Release，并上传当前平台构建产物。
3. 支持 dry-run 预览，避免误操作。
4. CI 平台可配置（Windows / macOS / Linux），默认使用 Windows。
5. 产物同时保留在本地 `dist/` 和 GitHub Release 附件中。

## 非目标

- 不实现多平台并行构建矩阵（本项目当前阶段只发布「当前平台」）。
- 不实现代码签名 / 公证（notarization）。
- 不自动发布到 npm 或其他第三方平台。

## 当前状态

- `package.json` 已使用 conventional commits（`feat:` / `fix:` / `chore:` 等）。
- `npm run build` 已能调用 `electron-builder` 生成当前平台安装包。
- 当前输出目录为 `dist/`，Windows 下产物为 `AI状态监控 1.x.x.exe`。
- 没有 git tag、CHANGELOG 或 GitHub Actions 工作流。

## 方案选择

### 方案一：`commit-and-tag-version` + GitHub Actions（推荐）

使用 `commit-and-tag-version`（`standard-version` 的维护版）处理本地版本推断、CHANGELOG 生成、commit、tag 和推送；使用 GitHub Actions 处理远端 Release 创建和产物上传。

**优点：**
- 配置简单，一行命令完成本地全部操作。
- 与现有 conventional commits 规范无缝衔接。
- CHANGELOG 自动生成，维护成本低。

**缺点：**
- 本地必须能 push 到 origin。
- 多平台发布需要多次手动触发 workflow（但符合当前「只发当前平台」的约束）。

### 方案二：`release-it` + GitHub Actions

使用 `release-it` 插件生态完成本地发布前准备。

**优点：**
- 可扩展性极强，后续可加 pre-release、GitHub release 创建等。

**缺点：**
- 配置较重，对当前需求过度设计。

### 方案三：纯自定义脚本

自行编写 Node 脚本调用 `conventional-recommended-bump`、`conventional-changelog-cli` 和 git 命令。

**优点：**
- 完全可控。

**缺点：**
- 代码量和维护成本最高。

**最终选择：方案一。**

## 架构设计

```
本地开发者
    │
    ▼
npm run release:dry-run    ← 只读预览
    │
    ▼
npm run release            ← 本地发布
    ├── 按 conventional commits 计算 semver
    ├── 更新 package.json / package-lock.json 版本
    ├── 生成 / 追加 CHANGELOG.md
    ├── git commit（chore(release): x.x.x）
    ├── 打 tag（vX.X.X）
    └── git push --follow-tags
                │
                ▼
        GitHub Actions
                │
                ▼
    .github/workflows/release.yml
        ├── 由 tag push 触发
        ├── workflow_dispatch 可选平台
        ├── 安装 Node 依赖
        ├── npm run build
        └── 创建 GitHub Release + 上传 dist 产物
```

核心原则：**本地只产生版本元数据（版本号、changelog、tag），构建和发布动作交给 CI**，保证可重复、可追溯。

## 本地发布流程

### 新增依赖

```bash
npm install -D commit-and-tag-version
```

### npm scripts

在 `package.json` 中新增：

```json
{
  "scripts": {
    "release:dry-run": "commit-and-tag-version --dry-run",
    "release": "commit-and-tag-version"
  }
}
```

### 补充 package.json 仓库信息

为了让 changelog 中的 commit 链接和 compare 链接生效，需要确保 `package.json` 包含 `repository` 字段：

```json
{
  "repository": {
    "type": "git",
    "url": "https://github.com/<owner>/<repo>.git"
  }
}
```

### `.versionrc.json` 配置

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

### 命令行为

#### `npm run release:dry-run`

- 只打印不修改文件。
- 输出新版本号、CHANGELOG 预览、将要创建的 commit 和 tag。
- 用于发布前确认。

#### `npm run release`

- 检查工作区是否干净。
- 按 conventional commits 推断 semver 版本。
- 更新 `package.json` 和 `package-lock.json`。
- 更新 `CHANGELOG.md`。
- 提交 `chore(release): vX.X.X`。
- 打 tag `vX.X.X`。
- 推送 commit 和 tag。

#### 手动覆盖

如需强制指定版本：

```bash
npm run release -- --release-as patch
npm run release -- --release-as minor
npm run release -- --release-as 1.2.3
```

## GitHub Actions 工作流

### 文件

`.github/workflows/release.yml`

### 触发方式

```yaml
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
```

### Job 设计

```yaml
jobs:
  release:
    runs-on: ${{ github.event.inputs.platform || 'windows-latest' }}
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

### 产物过滤

`electron-builder` 当前配置产物：

- Windows：`dist/AI状态监控 1.x.x.exe`（portable）
- macOS：`dist/AI状态监控-1.x.x.dmg`
- Linux：`dist/AI状态监控-1.x.x.AppImage`

上传时只匹配最终安装包，排除 `dist/win-unpacked`、`dist/builder-*`、`.yaml` 等中间文件。

### Release body

- 使用 tag 名作为 Release 标题。
- Release 说明从 `CHANGELOG.md` 对应版本段落自动提取；提取失败时回退到默认说明。
- tag 名包含 `-`（如 `v1.1.0-beta.0`）时自动标记为 pre-release。

## 错误处理与保护机制

### 本地侧

| 保护点 | 处理方式 |
|---|---|
| 工作区不干净 | `commit-and-tag-version` 默认会失败，提示先提交代码 |
| 不在默认分支 | 通过 pre-release 脚本检查 `main`/`master` |
| 无新 commit 导致无版本变化 | dry-run 可提前发现，`commit-and-tag-version` 会给出提示 |
| 版本号不符合预期 | 先执行 `release:dry-run` 预览 |
| 远程 tag 已存在 | push 失败，需手动处理冲突 |

### CI 侧

| 保护点 | 处理方式 |
|---|---|
| 构建失败 | workflow 直接失败，不会创建空 Release |
| 产物不存在 | `action-gh-release` 会报错 |
| Release 已存在 | 默认更新现有 Release 并追加附件 |
| 非 tag 触发 workflow_dispatch | workflow_dispatch 必须输入有效 tag，检出对应 tag 后构建 |

### 额外建议

- 本地 `release` 前和 CI 构建前都运行 `npm run typecheck`，保证 tag 点代码无类型错误。
- 建议将 `release` 与 `release:dry-run` 写入项目文档和 `AGENTS.md`。

## 验证与测试计划

### 本地验证（不联网）

1. 运行 `npm run release:dry-run`，确认新版本号和 changelog 分组正确。
2. 运行 `npm run build`，确认 `dist/` 下生成最终安装包。

### 沙盒验证（联网但不污染主仓库）

1. 在 fork 或个人测试仓库完成一次完整发布：
   - 提交几个 conventional commits。
   - 执行 `npm run release`。
   - 确认 tag 和 changelog 提交正确。
   - 推送到 GitHub。
   - 确认 Actions 触发、Release 创建、附件上传成功。
2. 测试 `workflow_dispatch` 切换平台：
   - 手动选择 `ubuntu-latest` / `macos-latest`。
   - 确认不同平台产物命名和上传正确。

### 真实发布

1. 确认默认分支干净。
2. `npm run release:dry-run` 预览。
3. `npm run release` 正式发布。
4. 等待 GitHub Actions 完成。
5. 到 Release 页面检查附件和说明。

### 回滚预案

- 如果 Release 附件传错：删除 Release，重新触发 `workflow_dispatch` 选择对应 tag。
- 如果版本号打错：删除本地/远程 tag，修正后重新 release。

## 后续可扩展

- 多平台并行构建矩阵：当需要同时发布 Windows/macOS/Linux 时，将 workflow 改为 matrix 策略。
- 代码签名：Windows 添加 `certificateFile`/`certificatePassword`，macOS 添加 `identity` 和 notarization 配置。
- 自动 pre-release：通过 tag 前缀（如 `v1.0.0-beta.1`）自动识别并标记 pre-release（已在本设计中支持）。

## 参考

- [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version)
- [electron-builder](https://www.electron.build/)
- [softprops/action-gh-release](https://github.com/softprops/action-gh-release)
