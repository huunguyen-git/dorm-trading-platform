// P1-01 live check: isolated p101-postgres/Maildev/API/Vite only. See docs/specs/P1-01.md.
const { chromium } = require('../.local/p1-tools/node_modules/playwright');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const base = 'http://localhost:28082/api/v1';
const email = `e2e${Date.now()}@student.edu.vn`;
const password = 'cobalt meadow lantern orbit 9842';
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
    page.on('response', r => { if(r.url().includes('/auth/')) console.log(new URL(r.url()).pathname, r.status()); });
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
    await page.getByLabel('Mật khẩu mới (15–128 ký tự)',{exact:true}).fill('silver forest compass orbit 4278');
    await page.getByLabel('Xác nhận mật khẩu mới',{exact:true}).fill('silver forest compass orbit 4278');
    await page.getByRole('button',{name:'Lưu mật khẩu',exact:true}).click();
    await page.getByText('Đã đổi mật khẩu và đăng xuất các phiên khác.',{exact:true}).waitFor();
    assert.equal((await fetch(base+'/auth/me',{headers:{Authorization:`Bearer ${pending.token}`}})).status,401);
    await page.screenshot({path:'.local/p1-web-verified.png',fullPage:true});
    await page.getByRole('button',{name:'Đăng xuất',exact:true}).click();
    await page.getByRole('button',{name:'Đăng nhập',exact:true}).waitFor();
    await page.reload(); await page.getByRole('button',{name:'Đăng nhập',exact:true}).waitFor();
    console.log('PASS: real SMTP + registration/OTP + pending 403 + browser login/cookie/restore/change/revocation/logout');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e.message); process.exitCode=1;});
