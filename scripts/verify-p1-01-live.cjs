// Bounded live run against the isolated p101 containers described in docs/specs/P1-01.md.
// Build backend with Maven verify first; this runner never changes production settings.
const { spawn, execFileSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const net = require('node:net');
const root = path.resolve(__dirname, '..');
const base = 'http://localhost:28082/api/v1';
const children = new Set();
const native = process.argv.includes('--android');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function launch(command, args, options = {}) {
  const child = spawn(command, args, { cwd: root, windowsHide: true, stdio: 'inherit', ...options });
  children.add(child);
  child.once('exit', () => children.delete(child));
  child.once('error', () => children.delete(child));
  return child;
}
function runNode(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = launch(process.execPath, args, options);
    const timer = setTimeout(() => { child.kill(); reject(new Error(`Timed out: ${args[0]}`)); }, 180000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`${args[0]} exited ${code}`)); });
  });
}
async function requireFreePort(port) {
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(port, '127.0.0.1', () => probe.close(resolve));
  });
}

(async () => {
  process.chdir(root);
  const jar = path.join(root, 'backend/target/backend-0.0.1-SNAPSHOT.jar');
  if (!fs.existsSync(jar)) throw new Error('Build the current backend with Maven verify first.');
  // Inspect named fixtures only; do not start or stop services belonging to another task.
  for (const name of ['p101-postgres', 'p101-maildev']) {
    const container = JSON.parse(execFileSync('docker', ['inspect', name], { encoding: 'utf8', windowsHide: true }))[0];
    if (!container.State.Running) throw new Error(`Start the isolated ${name} container first.`);
    const expected = name === 'p101-postgres' ? { '5432/tcp': '25432' } : { '1025/tcp': '21025', '1080/tcp': '21080' };
    for (const [port, hostPort] of Object.entries(expected)) {
      const binding = container.HostConfig.PortBindings[port];
      if (binding?.length !== 1 || binding[0].HostIp !== '127.0.0.1' || binding[0].HostPort !== hostPort)
        throw new Error(`Unexpected binding for ${name}:${port}; use the isolated loopback fixtures.`);
    }
  }
  await requireFreePort(28082);
  await requireFreePort(25173);
  if (native) await requireFreePort(28081);
  fs.mkdirSync(path.join(root, '.local'), { recursive: true });
  const log = fs.openSync(path.join(root, '.local/p1-01-live-backend.log'), 'w');
  let server;
  try {
    const java = process.env.P1_JAVA || (process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : 'java');
    const backend = launch(java, ['-jar', 'backend/target/backend-0.0.1-SNAPSHOT.jar'], { stdio: ['ignore', log, log], env: {
      ...process.env, JWT_SECRET: randomBytes(48).toString('base64'), SERVER_PORT: '28082', SERVER_ADDRESS: '127.0.0.1',
      SPRING_DATASOURCE_URL: 'jdbc:postgresql://127.0.0.1:25432/p101', POSTGRES_USER: 'p101', POSTGRES_PASSWORD: 'p101-local-test',
      SPRING_MAIL_HOST: '127.0.0.1', SPRING_MAIL_PORT: '21025', CORS_ALLOWED_ORIGINS: 'http://localhost:25173',
    } });
    let startupError;
    backend.once('error', error => { startupError = error; });
    let ready = false;
    for (let i = 0; i < 90; i++) {
      if (startupError) throw startupError;
      if (backend.exitCode !== null) throw new Error('Backend exited; see .local/p1-01-live-backend.log.');
      try { ready = (await fetch(`${base}/health`, { signal: AbortSignal.timeout(1000) })).ok; } catch {}
      if (ready) break;
      await pause(1000);
    }
    if (!ready) throw new Error('Backend readiness timed out; see .local/p1-01-live-backend.log.');
    process.env.VITE_API_URL = base;
    const { createServer } = await import(pathToFileURL(path.join(root, 'admin-web/node_modules/vite/dist/node/index.js')).href);
    server = await createServer({ root: path.join(root, 'admin-web'), server: { host: 'localhost', port: 25173, strictPort: true } });
    await server.listen();
    await runNode(['scripts/verify-p1-01-web.cjs']);
    await runNode(['node_modules/jest/bin/jest.js', '--runInBand', '--testMatch', '**/e2e/auth.live.tsx'], {
      cwd: path.join(root, 'mobile'), env: { ...process.env, EXPO_PUBLIC_API_URL: base, P1_MAILDEV_URL: 'http://localhost:21080' },
    });
    console.log('PASS live web + mobile renderer against current API/PostgreSQL/SMTP. Native SecureStore is not covered.');
    if (native) {
      const metro = launch(process.execPath, ['scripts/start-p1-01-mobile.cjs'], { env: {
        ...process.env, CI: '1', EXPO_OFFLINE: '1', EXPO_PUBLIC_API_URL: 'http://127.0.0.1:28082/api/v1',
      } });
      let metroError;
      metro.once('error', error => { metroError = error; });
      let metroReady = false;
      for (let i = 0; i < 60; i++) {
        if (metroError) throw metroError;
        if (metro.exitCode !== null) throw new Error('Metro exited before readiness.');
        try { metroReady = (await (await fetch('http://localhost:28081/status', { signal: AbortSignal.timeout(1000) })).text()) === 'packager-status:running'; } catch {}
        if (metroReady) break;
        await pause(1000);
      }
      if (!metroReady) throw new Error('Metro readiness timed out.');
      await runNode(['scripts/verify-p1-01-android.cjs']);
    }
  } finally {
    if (server) {
      try { await server.close(); } catch {}
    }
    const running = [...children];
    await Promise.all(running.map(child => new Promise(resolve => {
      if (child.exitCode !== null || child.signalCode !== null) {
        resolve();
        return;
      }
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(finish, 5000);
      child.once('exit', finish);
      child.once('error', finish);
      try {
        // Oracle's Windows javapath launcher starts a second JVM process. Kill the
        // owned process tree so the API port is released even when using that shim.
        if (process.platform === 'win32' && child.pid) {
          execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        } else {
          child.kill();
        }
      } catch {
        if (child.exitCode !== null || child.signalCode !== null) finish();
      }
    })));
    try { fs.closeSync(log); } catch {}
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
