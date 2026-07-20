# Android 启动图标适配暗色模式

## Context
Android 端启动图标当前使用亮紫色背景，在暗色桌面或暗色模式下显得突兀，需要换成更协调的深色背景。

## User Decisions
| 决策项 | 用户选择 |
|--------|----------|
| 修改范围 | 只调整背景色，不动前景图标 |
| 目标风格 | 适配暗色模式，低调不刺眼 |

## Recommended Approach
1. 在 `colors.xml` 中新增深色背景色 `#FF1A1A2E`。
2. 将 `ic_launcher_background.xml` 的背景引用从 `@color/purple_500` 改为新颜色。
3. 保持前景 `ic_launcher_foreground.xml` 为白色，确保在深色背景上清晰可见。
4. 构建验证 `assembleDebug` 通过。

## Critical Files
- `android-app/app/src/main/res/values/colors.xml`
- `android-app/app/src/main/res/drawable/ic_launcher_background.xml`

## Verification
- `./gradlew assembleDebug` 成功
- 在真机/模拟器启动器中查看暗色模式效果

## Risks & Mitigation
| 风险 | 缓解措施 |
|------|----------|
| 深色背景在某些浅色壁纸上对比度不足 | 前景保持白色，形状清晰即可 |
| 用户希望进一步品牌化 | 后续可重绘前景矢量图标 |
