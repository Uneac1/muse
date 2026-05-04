const { execFileSync } = require('child_process');
const path = require('path');

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanupWindows(targetPattern) {
  const script = `
$pattern = '${targetPattern.replace(/'/g, "''")}';
$killed = @();
Get-CimInstance Win32_Process -Filter "name = 'node.exe'" | Where-Object {
  $_.CommandLine -and $_.CommandLine -match $pattern
} | ForEach-Object {
  try {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop;
    $killed += $_.ProcessId;
  } catch {}
}
$killed | ConvertTo-Json -Compress
`;

  let output = '';
  try {
    output = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { encoding: 'utf8' },
    ).trim();
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
    if (code === 'EPERM' || code === 'EACCES') {
      return [];
    }
    throw error;
  }

  if (!output) {
    return [];
  }
  const parsed = JSON.parse(output);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function cleanupPosix(targetPath) {
  const output = execFileSync('ps', ['-ax', '-o', 'pid=', '-o', 'command='], {
    encoding: 'utf8',
  });
  const killed = [];
  output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const match = line.match(/^(\d+)\s+(.*)$/);
      if (!match) {
        return;
      }
      const [, pidText, command] = match;
      const pid = Number(pidText);
      if (!Number.isFinite(pid) || pid === process.pid || !command.includes(targetPath)) {
        return;
      }
      try {
        process.kill(pid, 'SIGKILL');
        killed.push(pid);
      } catch {}
    });
  return killed;
}

function cleanupServerProcesses() {
  const repoRoot = path.resolve(__dirname, '..');
  const targetPath = path.join(repoRoot, 'server', 'dist', 'server.js');

  if (process.platform === 'win32') {
    const normalized = escapeRegExp(targetPath).replace(/\\\\/g, '[\\\\/]+');
    return cleanupWindows(normalized);
  }

  return cleanupPosix(targetPath);
}

if (require.main === module) {
  const killed = cleanupServerProcesses();
  if (!process.argv.includes('--quiet')) {
    console.log(JSON.stringify({ killedCount: killed.length, pids: killed }, null, 2));
  }
}

module.exports = {
  cleanupServerProcesses,
};
