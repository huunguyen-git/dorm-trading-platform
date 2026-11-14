// Bounded GUI test. API fixtures are confined to Playwright routing, never production code.
// Run from repo root after installing Playwright into .local/p1-tools (see GUI checklist).
const { chromium } = require('../.local/p1-tools/node_modules/playwright');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');

(async () => {
  process.env.VITE_API_URL = '/api/v1';
  const { createServer } = await import(pathToFileURL(path.resolve('admin-web/node_modules/vite/dist/node/index.js')).href);
  const server = await createServer({ root: path.resolve('admin-web'), server: { host: '127.0.0.1', port: 0 } });
  let browser;
  try {
    await server.listen();
    const port = server.httpServer.address().port;
    browser = await chromium.launch({ channel: process.env.P1_BROWSER_CHANNEL || 'msedge', headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    let signedIn = false, resets = 0;
    const user = { id: 'gui-user', name: 'Nguyễn An', email: 'an@truong.edu.vn', role: 'moderator', roles: ['MEMBER','MODERATOR'], emailVerified: true, profileApproved: true, accountStatus: 'HOAT_DONG' };
    await context.route('**/api/v1/**', async route => {
      const endpoint = new URL(route.request().url()).pathname;
      const body = route.request().postDataJSON() || {};
      const reply = (status, json) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) });
      if (endpoint.endsWith('/auth/me')) return signedIn ? reply(200, user) : reply(401, { message: 'Phiên đã hết hạn.' });
      if (endpoint.endsWith('/auth/login')) {
        if (body.password === 'wrong') return reply(401, { message: 'Email hoặc mật khẩu không đúng.' });
        signedIn = true; return reply(200, { token: 'fixture-token', user });
      }
      if (endpoint.endsWith('/auth/logout')) { signedIn = false; return route.fulfill({ status: 204 }); }
      if (endpoint.endsWith('/auth/otp/resend')) return reply(200, { challengeId: 'fixture-challenge', expiresIn: 300, resendAfter: 60, message: 'Nếu email có tài khoản phù hợp, chúng tôi sẽ gửi mã xác minh.' });
      if (endpoint.endsWith('/auth/otp/verify')) return body.code === '123456' ? reply(200, { resetToken: 'fixture-grant' }) : reply(400, { message: 'Mã không hợp lệ, đã dùng hoặc hết hạn.' });
      if (endpoint.endsWith('/auth/password/reset')) { resets++; return route.fulfill({ status: 204 }); }
      if (endpoint.endsWith('/auth/password/change')) return reply(200, { token: 'fixture-new-token', user });
      return reply(404, { message: 'Endpoint ngoài phạm vi GUI test.' });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${port}`);
    await page.getByRole('heading', { name: 'Đăng nhập', exact: true }).waitFor();
    fs.mkdirSync('.local/p1-gui', { recursive: true });
    await page.screenshot({ path: '.local/p1-gui/01-login-desktop.png', fullPage: true });
    await page.getByLabel('Email', { exact: true }).fill('an@truong.edu.vn');
    await page.getByLabel('Mật khẩu', { exact: true }).fill('wrong');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Email hoặc mật khẩu không đúng.' }).waitFor();
    await page.getByRole('button', { name: 'Quên mật khẩu', exact: true }).click();
    await page.getByLabel('Email', { exact: true }).fill('an@truong.edu.vn');
    await page.getByRole('button', { name: 'Gửi mã', exact: true }).click();
    await page.getByTestId('reset-otp').fill('111111');
    await page.getByRole('button', { name: 'Xác minh', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Mã không hợp lệ' }).waitFor();
    assert.equal(await page.getByRole('button', { name: /Gửi lại sau/ }).isDisabled(), true);
    await page.screenshot({ path: '.local/p1-gui/02-otp-error.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: '.local/p1-gui/03-otp-mobile.png', fullPage: true });
    await page.getByTestId('reset-otp').fill('123456');
    await page.getByRole('button', { name: 'Xác minh', exact: true }).click();
    await page.getByLabel('Mật khẩu mới (15–128 ký tự)', { exact: true }).fill('a quiet river beneath stars');
    await page.getByLabel('Xác nhận mật khẩu mới', { exact: true }).fill('not the same phrase');
    await page.getByRole('button', { name: 'Lưu mật khẩu', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Mật khẩu xác nhận chưa khớp.' }).waitFor();
    assert.equal(resets, 0);
    await page.getByLabel('Xác nhận mật khẩu mới', { exact: true }).fill('a quiet river beneath stars');
    await page.getByRole('button', { name: 'Lưu mật khẩu', exact: true }).click();
    await page.getByTestId('password-success').waitFor();
    assert.equal(resets, 1);
    await page.screenshot({ path: '.local/p1-gui/04-success-mobile.png', fullPage: true });
    await page.getByRole('button', { name: 'Về đăng nhập', exact: true }).click();
    await page.getByLabel('Email', { exact: true }).fill('an@truong.edu.vn');
    await page.getByLabel('Mật khẩu', { exact: true }).fill('a quiet river beneath stars');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page.getByRole('heading', { name: 'Tài khoản & bảo mật', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: '.local/p1-gui/05-account.png', fullPage: true });
    await page.getByRole('button', { name: 'Đổi mật khẩu', exact: true }).click();
    await page.getByLabel('Mật khẩu hiện tại', { exact: true }).fill('a quiet river beneath stars');
    await page.getByLabel('Mật khẩu mới (15–128 ký tự)', { exact: true }).fill('three islands beyond the horizon');
    await page.getByLabel('Xác nhận mật khẩu mới', { exact: true }).fill('three islands beyond the horizon');
    await page.getByRole('button', { name: 'Lưu mật khẩu', exact: true }).click();
    await page.getByRole('button', { name: 'Về tài khoản', exact: true }).click();
    await page.getByRole('button', { name: 'Đăng xuất phiên này', exact: true }).click();
    await page.getByRole('heading', { name: 'Đăng nhập', exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log('PASS GUI fixtures: login error, OTP error/cooldown, confirmation guard, reset success, account, change, logout; 1440px/390px, no overflow/page errors.');
  } finally {
    if (browser) await browser.close();
    await server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
