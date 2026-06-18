# 修复打包后启动报 `Cannot find module '../shared/constants'`

## 根因

`tsconfig.main.json` 把 `rootDir` 设为 `./src`,tsc 编译后目录结构是平行布局:
- `dist/main/*.js` → `require("../shared/...")`
- `dist/shared/{constants,types,utils}/...js`

而 `package.json` 的 electron-builder `files` 只声明 `dist/main/**/*` 与 `dist/renderer/**/*`,**未包含 `dist/shared/**/*`**。打包后 `dist/shared/` 被剔除,主进程加载 `../shared/constants` 时找不到模块。

被剔除的运行时模块(`type` 导入会被 tsc 擦掉,只列出值导入):
- `WS_PORT`、`IPC_CHANNELS`、`DEFAULT_USAGE_THRESHOLDS`、`normalizeCwd`

## 修复

`package.json` 的 `build.files` 追加 `"dist/shared/**/*"`。

## 验证

1. `npm run build` 重新打包
2. 启动可执行文件,确认主进程不再抛 `Cannot find module`
3. WebSocket 推送正常

## 范围

- 影响:`package.json` 单文件
- 风险:低;`dist/shared/` 仅含 main 进程运行时依赖,无敏感资源