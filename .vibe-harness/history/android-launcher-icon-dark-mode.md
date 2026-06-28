# Android 启动图标适配暗色模式

## 时间
2026-06-28

## 改动原因
Android 端启动图标在暗色桌面/壁纸下显示为亮紫色背景，视觉效果突兀。将图标背景改为深色，使其在暗色模式下更协调。

## 改动范围
- `android-app/app/src/main/res/values/colors.xml`
  - 新增 `launcher_background` 色值 `#FF1A1A2E`（深蓝灰）
- `android-app/app/src/main/res/drawable/ic_launcher_background.xml`
  - 背景色从 `@color/purple_500` 改为 `@color/launcher_background`

## 验证结果
- `./gradlew assembleDebug` 成功
- 未在真机启动器上做最终视觉确认

## 后续可选优化
- 若需要更强的品牌识别，可重绘前景矢量图标（如机器人/信号灯造型）。
- 可为 Android 13+ 提供 `<monochrome>` 层以支持主题图标。
