# Claude Code 状态上报脚本 (Windows PowerShell)
# 将此脚本配置为 Claude Code 的 statusLine 命令
#
# 配置方法:
#   /config set statusLine "powershell -File C:\path\to\claude-status.ps1"
#
# Claude Code 会将 JSON 状态数据通过 stdin 传入此脚本

$STATUS_DIR = Join-Path $env:USERPROFILE ".ai-status-monitor"
$STATUS_FILE = Join-Path $STATUS_DIR "claude-status.json"

# 确保目录存在
if (!(Test-Path $STATUS_DIR)) {
    New-Item -ItemType Directory -Path $STATUS_DIR -Force | Out-Null
}

# 读取 stdin 的 JSON 数据
$jsonInput = $input | Out-String

# 添加时间戳并写入状态文件
try {
    $data = $jsonInput | ConvertFrom-Json
    $data | Add-Member -NotePropertyName "lastActivity" -NotePropertyValue (Get-Date -Format "o") -Force
    $data | ConvertTo-Json -Depth 10 | Set-Content $STATUS_FILE
} catch {
    # 解析失败，写入基本状态
    @{ state = "executing"; lastActivity = (Get-Date -Format "o") } | ConvertTo-Json | Set-Content $STATUS_FILE
}
