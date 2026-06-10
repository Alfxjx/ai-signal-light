const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * AI 助手状态上报脚本 (Node.js 跨平台版本)
 * 支持 Windows / macOS / Linux
 * 
 * 用法:
 *   node status-reporter.js --claude    # 上报 Claude Code 状态
 *   node status-reporter.js --kimi      # 上报 Kimi Code CLI 状态
 *   node status-reporter.js --watch     # 持续监控并上报
 * 
 * Claude Code 配置:
 *   /config set statusLine "node C:\path\to\status-reporter.js --claude-stdin"
 * 
 * Kimi Code CLI 配置:
 *   将以下命令加入 Windows 计划任务或开机启动:
 *   node C:\path\to\status-reporter.js --watch
 */

const STATUS_DIR = path.join(os.homedir(), '.ai-status-monitor');

function ensureDir() {
  if (!fs.existsSync(STATUS_DIR)) {
    fs.mkdirSync(STATUS_DIR, { recursive: true });
  }
}

function writeStatusFile(filename, data) {
  ensureDir();
  const filePath = path.join(STATUS_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// ==================== Claude Code 状态上报 ====================

function reportClaudeStatus() {
  // 从 stdin 读取 Claude Code 的 statusLine JSON
  let input = '';
  process.stdin.setEncoding('utf8');
  
  process.stdin.on('data', (chunk) => {
    input += chunk;
  });
  
  process.stdin.on('end', () => {
    try {
      const data = JSON.parse(input);
      data.lastActivity = new Date().toISOString();
      writeStatusFile('claude-status.json', data);
    } catch (e) {
      // 解析失败，写入基本状态
      writeStatusFile('claude-status.json', {
        state: 'executing',
        lastActivity: new Date().toISOString()
      });
    }
  });
}

// ==================== Kimi Code CLI 状态检测 ====================

const { exec } = require('child_process');

function findKimiProcess() {
  return new Promise((resolve) => {
    const platform = os.platform();
    
    if (platform === 'win32') {
      // Windows: 先检测 kimi.exe
      exec('tasklist /FI "IMAGENAME eq kimi.exe" /FO CSV /NH', (err, stdout) => {
        if (!err && stdout.trim()) {
          const lines = stdout.trim().split('\n');
          for (const line of lines) {
            const parts = line.split(',').map(p => p.replace(/"/g, '').trim());
            if (parts[0] && parts[0].toLowerCase() === 'kimi.exe') {
              resolve(parseInt(parts[1], 10));
              return;
            }
          }
        }
        
        // 备选: 检测 node.exe 中带有 kimi 的
        exec('wmic process where "name=\'node.exe\'" get ProcessId,CommandLine /format:csv', 
          { timeout: 5000 }, 
          (err2, stdout2) => {
            if (err2 || !stdout2.trim()) {
              resolve(null);
              return;
            }
            
            const lines = stdout2.trim().split('\n').filter(l => l.trim());
            for (let i = 1; i < lines.length; i++) {
              const parts = lines[i].split(',');
              if (parts.length >= 3) {
                const cmdLine = parts[1] || '';
                const pidStr = parts[parts.length - 1].trim();
                if (cmdLine.toLowerCase().includes('kimi')) {
                  const pid = parseInt(pidStr, 10);
                  if (!isNaN(pid)) {
                    resolve(pid);
                    return;
                  }
                }
              }
            }
            resolve(null);
          }
        );
      });
    } else {
      // macOS / Linux
      exec('pgrep -x "kimi" || pgrep -f "kimi"', (err, stdout) => {
        if (err || !stdout.trim()) {
          resolve(null);
          return;
        }
        const pid = parseInt(stdout.trim().split('\n')[0], 10);
        resolve(isNaN(pid) ? null : pid);
      });
    }
  });
}

async function reportKimiStatus() {
  const pid = await findKimiProcess();
  
  if (!pid) {
    writeStatusFile('kimi-status.json', {
      state: 'idle',
      running: false,
      model: null,
      tokensUsed: 0,
      lastActivity: null
    });
    console.log('[Kimi] No running process detected');
    return;
  }
  
  writeStatusFile('kimi-status.json', {
    state: 'executing',
    running: true,
    pid: pid,
    model: 'kimi-for-coding',
    tokensUsed: 0,
    lastActivity: new Date().toISOString()
  });
  console.log(`[Kimi] Process detected, PID: ${pid}`);
}

// ==================== 持续监控模式 ====================

async function watchMode() {
  console.log('[Watch] Monitoring AI assistant status...');
  console.log('[Watch] Press Ctrl+C to stop');
  
  // 首次检测
  await reportKimiStatus();
  
  // 每 5 秒检测一次
  setInterval(async () => {
    await reportKimiStatus();
  }, 5000);
}

// ==================== 主入口 ====================

const args = process.argv.slice(2);

if (args.includes('--claude-stdin')) {
  // Claude Code statusLine 模式: 从 stdin 读取 JSON
  reportClaudeStatus();
} else if (args.includes('--kimi')) {
  // 单次检测 Kimi 状态
  reportKimiStatus();
} else if (args.includes('--watch')) {
  // 持续监控模式
  watchMode();
} else {
  console.log(`
AI 助手状态上报脚本 (Node.js 跨平台版)

用法:
  node status-reporter.js --claude-stdin    从 stdin 读取 Claude 状态 (用于 statusLine)
  node status-reporter.js --kimi            单次检测 Kimi 进程状态
  node status-reporter.js --watch           持续监控 Kimi 状态 (每5秒)

Windows 配置:
  1. Claude Code: /config set statusLine "node ${__filename} --claude-stdin"
  2. Kimi: 将 "node ${__filename} --watch" 加入计划任务
`);
}
