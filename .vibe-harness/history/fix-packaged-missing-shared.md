# fix-packaged-missing-shared

- 时间:2026-06-18
- 范围:`package.json` electron-builder `build.files` 追加 `dist/shared/**/*`
- 关联:`package.json`、`tsconfig.main.json`、`src/main/{main,server,config,detector,usage-monitor}.ts`
- 改动摘要:1 行新增
- 影响范围:打包产物结构;运行时无差异
- 验证:`npm run build` 后可执行文件正常启动,WebSocket 推送可用