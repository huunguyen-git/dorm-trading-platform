// Opt-in native smoke test. Requires an already running API/Maildev and Expo Go
// with this mobile source on port 28081. See the P1-01 GUI checklist.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const serial = process.env.P1_ANDROID_SERIAL || 'emulator-5554';
const base = 'http://127.0.0.1:28082/api/v1';
const folder = '.local/p1-native';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8', windowsHide: true, timeout: 15000 });
const decode = s => s.replace(/&(quot|amp|lt|gt|apos);/g, (_, entity) => ({ quot: '"', amp: '&', lt: '<', gt: '>', apos: "'" })[entity]);
function nodes() {
  adb('shell', 'uiautomator', 'dump', '/sdcard/p101-window.xml');
  const xml = adb('shell', 'cat', '/sdcard/p101-window.xml');
  return [...xml.matchAll(/<node\b([^>]+)>/g)].map(match => Object.fromEntries(
    [...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(([, key, value]) => [key, decode(value)])));
}
async function locate(label, input = false) {
  for (let i = 0; i < 8; i++) {
    const found = nodes().find(n => (n['content-desc'] === label || n.text === label) &&
      (!input || n.class === 'android.widget.EditText') && n.bounds !== '[0,0][0,0]');
    if (found) return found;
    await pause(750);
  }
  throw new Error(`Native UI did not show: ${label}`);
}
async function tap(label, input = false) {
  const node = await locate(label, input);
  const [x1, y1, x2, y2] = node.bounds.match(/\d+/g).map(Number);
  adb('shell', 'input', 'tap', String(Math.floor((x1+x2)/2)), String(Math.floor((y1+y2)/2)));
  await pause(750);
}
async function type(label, value) {
  // All entered values are newly generated ASCII test data, never user secrets.
  assert.match(value, /^[a-zA-Z0-9@.]+$/);
  await tap(label, true);
  adb('shell', 'input', 'text', value);
  adb('shell', 'input', 'keyevent', '4');
}
function screenshot(name) {
  adb('shell', 'screencap', '-p', '/sdcard/p101-screen.png');
  adb('pull', '/sdcard/p101-screen.png', `${folder}/${name}.png`);
}
async function request(path, body) {
  const response = await fetch(base+path, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  assert.ok(response.ok, `${path} returned ${response.status}`);
  return response.status === 204 ? null : response.json();
}
async function reopen() {
  adb('shell', 'am', 'force-stop', 'host.exp.exponent');
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'exp://127.0.0.1:28081');
  await pause(4000);
}

(async () => {
  fs.mkdirSync(folder, { recursive:true });
  adb('reverse','tcp:28081','tcp:28081'); adb('reverse','tcp:28082','tcp:28082');
  await reopen();
  const email = `native${Date.now()}@student.edu.vn`;
  const password = `NativeRiverKey${Date.now()}`;
  const registration = await request('/auth/register', {name:'Native Test',studentId:`N${Date.now()}`,email,password});
  let code;
  for (let i = 0; i < 20 && !code; i++) {
    const messages = await (await fetch('http://localhost:21080/email')).json();
    for (const message of messages.filter(m => m.to.some(t => t.address === email))) {
      const detail = await (await fetch(`http://localhost:21080/email/${message.id}`)).json();
      code = detail.text.match(/\b\d{6}\b/)?.[0];
    }
    if (!code) await pause(1000);
  }
  assert.ok(code, 'Native fixture must verify email through real SMTP.');
  await request('/auth/otp/verify', {challengeId:registration.challengeId,email,purpose:'REGISTER',code});
  if (nodes().some(n => n['content-desc'] === 'Continue')) { await tap('Continue'); await pause(1500); }
  if (!nodes().some(n => n['content-desc'] === 'Email')) await tap('Đăng nhập');
  await type('Email', email); await type('Mật khẩu', password);
  await tap('Đăng nhập');
  await tap('Hồ sơ'); await locate(email);
  screenshot('01-signed-in');
  await reopen();
  await tap('Hồ sơ'); await locate(email);
  assert.equal(nodes().some(n => n['content-desc'] === 'Đăng nhập'), false);
  screenshot('02-restored-after-process-stop');
  // Profile actions can be below the fold on a small emulator.
  if (!nodes().some(n => n['content-desc'] === 'Đăng xuất thiết bị này')) adb('shell','input','swipe','360','1000','360','400','400');
  await tap('Đăng xuất thiết bị này'); await locate('Đăng nhập');
  await reopen(); await locate('Đăng nhập');
  screenshot('03-logged-out-after-process-stop');
  console.log('PASS Android Expo Go: native login, profile, SecureStore restore after process stop, logout remains logged out after process stop. Registration/SMTP verification used API fixtures.');
})().catch(error => { try { screenshot('failure'); } catch {} console.error(error.message); process.exitCode=1; });
