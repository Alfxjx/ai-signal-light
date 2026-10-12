# fix-preload-sandbox-require

- 时间：2026-10-12
- 范围：修复主面板（悬浮窗/Pin/设置/最小化按钮）与设置窗口（token 回显 + 保存）全部点击无反应
- 关联：`src/main/preload.ts`、`src/shared/types/ipc.ts`；历史相关 `fix-packaged-missing-shared`
- 根因：sandbox 版 preload（Electron ≥20 默认 `sandbox: true`）的 `preloadRequire` 是简化实现，**无法解析相对 require**（实测从磁盘和 asar 都报 `module not found: ../shared/types/ipc`）。preload 整文件加载失败 → `window.electronAPI` 为 undefined → 渲染层所有按钮守卫（`if (isElectron)` / `if (!window.electronAPI) return`）静默早退，表现为「点了没反应、无回显、保存无响应」
- 改动摘要：`preload.ts` 删除 `import { IPC_CHANNELS } from '../shared/types/ipc'`，改为文件内手工拷贝的通道表（preload 只允许 require('electron')）；`ipc.ts` 加注释提示两处同步
- 影响范围：仅 preload 注入链路；IPC 通道名、主进程、渲染层逻辑均无变化
- 验证：CDP 实测（`--remote-debugging-port` + Runtime.evaluate）：修复前 `typeof electronAPI === 'undefined'` 且控制台报 preload 加载失败；修复后主面板/设置窗口均为 `'object'`，`getSettings()` 返回 26 字段（含脱敏 token 回显 `sk-k****euB7`），设置窗口 Vue 正常挂载无 JS 错误；`npm test` 148 全过
- 注意：打包出的旧 exe（≤2.7.0）内置坏 preload，需 `npm run build` 重新打包才生效
