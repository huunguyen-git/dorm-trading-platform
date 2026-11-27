// Local emulator launcher. Expo's /status header cannot contain a Unicode
// projectRoot; Windows 8.3 paths keep the same files without moving the repo.
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const mobile = path.resolve(__dirname, '../mobile');
const cli = path.join(mobile, 'node_modules/expo/bin/cli');
let directory = mobile;
if (process.platform === 'win32' && /[^\x20-\x7e]/.test(directory)) {
  directory = execFileSync('cmd.exe', ['/d', '/c', 'for %I in (.) do @echo %~sI'], { cwd: mobile, encoding: 'utf8', windowsHide: true }).trim();
  if (/[^\x20-\x7e]/.test(directory)) throw new Error('Windows short paths are unavailable. Run the repo from an ASCII path for native Expo testing.');
}
process.chdir(directory);
process.env.EXPO_PUBLIC_API_URL ||= 'http://127.0.0.1:28082/api/v1';
process.argv = [process.execPath, cli, 'start', '--localhost', '--port', '28081', '--max-workers', '2', ...process.argv.slice(2)];
require(cli);
