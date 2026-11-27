// P1-01 live check: isolated p101-postgres/Maildev/API/Vite only. See docs/specs/P1-01.md.
const { chromium } = require('../.local/p1-tools/node_modules/playwright');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const base = 'http://localhost:28082/api/v1';
const email = `e2e${Date.now()}@student.edu.vn`;
const password = 'cobalt meadow lantern orbit 9842';
function fixture(sql) {
  return execFileSync('docker', ['exec', 'p101-postgres', 'psql', '-U', 'p101', '-d', 'p101', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8', windowsHide: true }).trim();
}
async function mailCode(knownIds = []) {
  for (let i = 0; i < 20; i++) {
    const messages = await (await fetch('http://localhost:21080/email')).json();
    const candidates = messages.filter(m => !knownIds.includes(m.id) && m.to.some(t => t.address === email));
    for (const message of candidates) {
      const detail = await (await fetch(`http://localhost:21080/email/${message.id}`)).json();
      const code = detail.text.match(/\b\d{6}\b/);
      if (code) return code[0];
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('SMTP OTP was not delivered to Maildev.');
}
async function request(path, body, token) {
  const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? {Authorization:`Bearer ${token}`} : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path} ${response.status}: ${text}`);
  return text ? JSON.parse(text) : undefined;
}
(async () => {
  const registration = await request('/auth/register', { name: 'P1 Browser Test', studentId: 'B'+Date.now(), email, password });
  let message;
  for (let i=0; i<15 && !message; i++) {
    const messages = await (await fetch('http://localhost:21080/email')).json();
    message = messages.find(m => m.to.some(t => t.address === email));
    if (!message) await new Promise(resolve=>setTimeout(resolve,1000));
  }
  assert.ok(message, 'SMTP message delivered to Maildev');
  const detail = await (await fetch(`http://localhost:21080/email/${message.id}`)).json();
  const code = detail.text.match(/\b\d{6}\b/)[0];
  await request('/auth/otp/verify', { challengeId: registration.challengeId, email, purpose: 'REGISTER', code });
  const pending = await request('/auth/login', {email,password,client:'mobile'});
  assert.equal(pending.user.emailVerified,true); assert.equal(pending.user.profileApproved,false);
  assert.equal((await fetch(base+'/orders/probe',{method:'POST',headers:{Authorization:`Bearer ${pending.token}`}})).status,403);
  // P1-02 fixture only: no activation endpoint is introduced by P1-01.
  execFileSync('docker',['exec','p101-postgres','psql','-U','p101','-d','p101','-c',`UPDATE thanh_viens SET profile_approved=true,trang_thai_tai_khoan='HOAT_DONG',diem_uy_tin=100 WHERE email='${email}'; INSERT INTO vai_tro_quan_tri(user_id,loai_vai_tro) SELECT user_id,'KIEM_DUYET_VIEN' FROM thanh_viens WHERE email='${email}';`],{stdio:'pipe'});
  const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  try {
    const context=await browser.newContext(); const page=await context.newPage();
    page.on('response', r => { if(r.url().includes('/api/v1/auth/')) console.log(new URL(r.url()).pathname, r.status()); });
    await page.goto('http://localhost:25173');
    await page.getByLabel('Email',{exact:true}).fill(email);
    await page.getByLabel('Mật khẩu',{exact:true}).fill(password);
    await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
    await page.getByRole('button',{name:'Đăng xuất',exact:true}).waitFor({timeout:10000}).catch(async e=>{ await page.screenshot({path:'.local/p1-web-error.png'}); console.log(await page.locator('body').innerText()); throw e; }); console.log('Logged in / restored');
    const cookies=await context.cookies('http://localhost:28082/api/v1/auth/refresh');
    const refresh=cookies.find(c=>c.name==='dorm_refresh'); assert.ok(refresh?.httpOnly && refresh.secure);
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('session_token')),null);
    await page.reload(); await page.getByRole('button',{name:'Đăng xuất',exact:true}).waitFor({timeout:10000}).catch(async e=>{ await page.screenshot({path:'.local/p1-web-error.png'}); console.log(await page.locator('body').innerText()); throw e; }); console.log('Logged in / restored');
    await page.getByRole('button',{name:'Đổi mật khẩu',exact:true}).click();
    await page.getByLabel('Mật khẩu hiện tại',{exact:true}).fill(password);
    await page.getByLabel('Mật khẩu mới (8–128 ký tự)',{exact:true}).fill('silver forest compass orbit 4278');
    await page.getByLabel('Xác nhận mật khẩu mới',{exact:true}).fill('silver forest compass orbit 4278');
    await page.getByRole('button',{name:'Lưu mật khẩu',exact:true}).click();
    await page.getByRole('button',{name:'Đăng nhập',exact:true}).waitFor();
    await page.reload(); await page.getByRole('button',{name:'Đăng nhập',exact:true}).waitFor();
    await page.getByLabel('Email',{exact:true}).fill(email);
    await page.getByLabel('Mật khẩu',{exact:true}).fill('silver forest compass orbit 4278');
    await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
    await page.getByRole('button',{name:'Đăng xuất',exact:true}).waitFor();
    await page.getByRole('button',{name:'Đăng xuất phiên này',exact:true}).waitFor();
    assert.equal((await fetch(base+'/auth/me',{headers:{Authorization:`Bearer ${pending.token}`}})).status,401);
    await page.screenshot({path:'.local/p1-web-verified.png',fullPage:true});

    const otherSession = await request('/auth/login', { email, password: 'silver forest compass orbit 4278', client: 'mobile' });
    // A DB generation fixture makes only the web access token stale; refresh remains valid.
    // This exercises a real API 401 without waiting 15 minutes or changing production TTL.
    fixture(`UPDATE auth_session SET generation=generation+1 WHERE user_id=(SELECT user_id FROM thanh_viens WHERE email='${email}') AND client='admin-web' AND NOT revoked;`);
    const refreshBefore = (await context.cookies(base+'/auth/refresh')).find(c => c.name === 'dorm_refresh').value;
    for (const failure of ['offline', '503']) {
      await page.route('**/api/v1/auth/refresh', route => failure === 'offline' ? route.abort('failed') : route.fulfill({ status: 503,
        headers: { 'Access-Control-Allow-Origin': 'http://localhost:25173', 'Access-Control-Allow-Credentials': 'true' },
        contentType: 'application/json', body: JSON.stringify({ message: 'SMTP-independent refresh outage fixture' }) }));
      await page.getByRole('button',{name:'Đăng xuất',exact:true}).click();
      await page.getByRole('alert').waitFor();
      assert.equal(await page.getByRole('button',{name:'Đăng nhập',exact:true}).count(), 0);
      assert.equal((await context.cookies(base+'/auth/refresh')).find(c => c.name === 'dorm_refresh').value, refreshBefore);
      assert.equal(fixture(`SELECT count(*) FROM auth_session WHERE user_id=(SELECT user_id FROM thanh_viens WHERE email='${email}') AND client='admin-web' AND NOT revoked;`), '1');
      await page.unroute('**/api/v1/auth/refresh');
    }
    await page.getByRole('button',{name:'Đăng xuất',exact:true}).click();
    await page.getByRole('button',{name:'Đăng nhập',exact:true}).waitFor();
    assert.equal(fixture(`SELECT count(*) FROM auth_session WHERE user_id=(SELECT user_id FROM thanh_viens WHERE email='${email}') AND client='admin-web' AND NOT revoked;`), '0');
    assert.equal((await fetch(base+'/auth/me',{headers:{Authorization:`Bearer ${otherSession.token}`}})).status,200);
    await page.reload(); await page.getByRole('button',{name:'Đăng nhập',exact:true}).waitFor();

    const knownIds = (await (await fetch('http://localhost:21080/email')).json()).map(m => m.id);
    await page.getByRole('button',{name:'Quên mật khẩu',exact:true}).click();
    await page.getByLabel('Email',{exact:true}).fill(email);
    let sent = page.waitForResponse(r => r.url() === base+'/auth/otp/resend' && r.request().method() === 'POST');
    await page.getByRole('button',{name:'Gửi mã',exact:true}).click();
    let delivery = await sent;
    if (delivery.status() === 429) {
      // Registration and reset share the approved email cooldown; honor the API's
      // wait rather than lowering limits or deleting rate-limit rows in the fixture.
      const seconds = Number(delivery.headers()['retry-after']);
      assert.ok(seconds > 0 && seconds <= 60, 'Only the registration cooldown is expected; do not bypass hourly quotas.');
      console.log(`Waiting ${seconds}s for the real email cooldown before reset.`);
      await new Promise(resolve => setTimeout(resolve, seconds * 1000 + 250));
      sent = page.waitForResponse(r => r.url() === base+'/auth/otp/resend' && r.request().method() === 'POST');
      await page.getByRole('button',{name:'Gửi mã',exact:true}).click();
      delivery = await sent;
    }
    assert.equal(delivery.status(), 200);
    await page.getByTestId('reset-otp').fill(await mailCode(knownIds));
    await page.getByRole('button',{name:'Xác minh',exact:true}).click();
    const resetPassword = 'copper planet riverside lantern 5823';
    await page.getByLabel('Mật khẩu mới (8–128 ký tự)',{exact:true}).fill(resetPassword);
    await page.getByLabel('Xác nhận mật khẩu mới',{exact:true}).fill(resetPassword);
    await page.getByRole('button',{name:'Lưu mật khẩu',exact:true}).click();
    await page.getByTestId('password-success').waitFor();
    assert.equal((await fetch(base+'/auth/me',{headers:{Authorization:`Bearer ${otherSession.token}`}})).status,401);
    await page.getByRole('button',{name:'Về đăng nhập',exact:true}).click();
    await page.getByLabel('Email',{exact:true}).fill(email);
    await page.getByLabel('Mật khẩu',{exact:true}).fill(resetPassword);
    await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
    await page.getByRole('button',{name:'Đăng xuất phiên này',exact:true}).waitFor();

    fixture(`UPDATE thanh_viens SET trang_thai_tai_khoan='BI_KHOA' WHERE email='${email}';`);
    await page.reload();
    await page.getByRole('button',{name:'Đăng nhập',exact:true}).waitFor();
    await page.getByLabel('Email',{exact:true}).fill(email);
    await page.getByLabel('Mật khẩu',{exact:true}).fill(resetPassword);
    const deniedLogin = page.waitForResponse(r => r.url().endsWith('/auth/login'));
    await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
    assert.equal((await deniedLogin).status(), 403);
    await page.getByRole('alert').waitFor();
    assert.equal(await page.getByRole('navigation').count(), 0);
    const restricted = await request('/auth/login', {email,password:resetPassword,client:'mobile'});
    assert.equal(restricted.user.accountStatus, 'BI_KHOA');
    assert.deepEqual(restricted.user.roles, []);
    assert.equal((await fetch(base+'/admin/probe',{headers:{Authorization:`Bearer ${restricted.token}`}})).status,403);
    await page.screenshot({path:'.local/p1-web-restricted.png',fullPage:true});
    await page.getByRole('button',{name:'Đăng nhập',exact:true}).waitFor();
    console.log('PASS: real SMTP registration/reset, pending403, cookie/restore, change/relogin, logout recovery after injected refresh offline/503, other session retained, reset revokes sessions, restricted account.');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e.message); process.exitCode=1;});
