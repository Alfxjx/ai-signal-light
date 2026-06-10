#!/bin/bash
# Claude Code 状态上报脚本
# 将此脚本配置为 Claude Code 的 statusLine 命令
#
# 配置方法:
# 1. 在 Claude Code 中运行: /config set statusLine /path/to/this/script.sh
# 2. 或编辑 ~/.claude/CLAUDE.md 添加 statusLine 配置
#
# Claude Code 会将 JSON 状态数据通过 stdin 传入此脚本

STATUS_DIR="$HOME/.ai-status-monitor"
STATUS_FILE="$STATUS_DIR/claude-status.json"

# 确保目录存在
mkdir -p "$STATUS_DIR"

# 读取 stdin 的 JSON 数据
json_input=$(cat)

# 添加时间戳并写入状态文件
echo "$json_input" | jq '. + {lastActivity: now | todateiso8601}' > "$STATUS_FILE"

# 可选: 同时输出到终端（调试用）
# echo "$json_input" | jq -r '.workspace.cwd // "unknown"'
