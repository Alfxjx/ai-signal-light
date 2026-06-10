# Kimi Code CLI 状态检测脚本 (Windows PowerShell)
# 由于 Kimi Code CLI 目前没有官方 statusLine 机制，
# 此脚本通过检测进程状态来推断 Kimi 的运行状态
#
# 使用方法:
#   单次检测: .\kimi-status.ps1
#   持续监控: while ($true) { .\kimi-status.ps1; Start-Sleep -Seconds 5 }

$STATUS_DIR = Join-Path $env:USERPROFILE ".ai-status-monitor"
$STATUS_FILE = Join-Path $STATUS_DIR "kimi-status.json"

# 确保目录存在
if (!(Test-Path $STATUS_DIR)) {
    New-Item -ItemType Directory -Path $STATUS_DIR -Force | Out-Null
}

# 检测 Kimi 进程
$kimiProcess = Get-Process -Name "kimi" -ErrorAction SilentlyContinue
$nodeProcess = $null

# 如果找不到 kimi.exe，尝试找 node.exe 中带 kimi 的
if (!$kimiProcess) {
    $allNode = Get-Process -Name "node" -ErrorAction SilentlyContinue
    foreach ($proc in $allNode) {
        try {
            # 通过 WMI 获取命令行参数
            $wmiProc = Get-WmiObject Win32_Process -Filter "ProcessId=$($proc.Id)" -ErrorAction SilentlyContinue
            if ($wmiProc -and $wmiProc.CommandLine -match "kimi") {
                $nodeProcess = $proc
                break
            }
        } catch {
            # 忽略错误
        }
    }
}

$targetProcess = if ($kimiProcess) { $kimiProcess } else { $nodeProcess }

if (!$targetProcess) {
    # Kimi 未运行
    @{
        state = "idle"
        running = $false
        model = $null
        tokensUsed = 0
        lastActivity = $null
    } | ConvertTo-Json | Set-Content $STATUS_FILE
    
    Write-Host "[Kimi] 未检测到运行中的进程"
    exit 0
}

# Kimi 正在运行
@{
    state = "executing"
    running = $true
    pid = $targetProcess.Id
    model = "kimi-for-coding"
    tokensUsed = 0
    lastActivity = (Get-Date -Format "o")
} | ConvertTo-Json | Set-Content $STATUS_FILE

Write-Host "[Kimi] 检测到进程 PID: $($targetProcess.Id)"
