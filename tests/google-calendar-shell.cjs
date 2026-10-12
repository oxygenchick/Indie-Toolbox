const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.PAINTING_BROWSER || 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, locale: 'ru-RU' });
    const calls = [];
    await page.route('https://accounts.google.com/gsi/client', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
    await page.route('https://www.googleapis.com/calendar/v3/**', route => {
      calls.push({ method: route.request().method(), path: new URL(route.request().url()).pathname });
      if (route.request().method() === 'GET') return route.fulfill({ json: { items: [] } });
      return route.fulfill({ json: route.request().postDataJSON() });
    });
    await page.goto((process.env.PAINTING_TEST_URL || 'http://127.0.0.1:8765') + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.documentElement.classList.contains('i18n-ready'));
    await page.evaluate(() => {
      localStorage.setItem('indietoolbox_google_calendar_client_id', '123-abc.apps.googleusercontent.com');
      localStorage.setItem('indietoolbox_google_calendar_token_expiry', '0');
      window.oauthPrompts = [];
      window.google = { accounts: { oauth2: { initTokenClient: settings => ({
        requestAccessToken: options => {
          window.oauthPrompts.push(options.prompt);
          settings.callback({ access_token: 'shell-token', expires_in: 3600 });
        }
      }) } } };
    });
    await page.locator('.desktop-icon-companion').click();
    assert.deepEqual(await page.evaluate(() => window.oauthPrompts), ['']);
    await page.frameLocator('iframe[src="Tasks.html"]').locator('body').waitFor();
    const frame = page.frames().find(item => item.url().endsWith('/Tasks.html'));
    assert(frame);
    await frame.evaluate(() => {
      const project = {
        tasks: [{ text: 'Из файла', days: ['2026-10-12'] }],
        calendarSync: {
          projectId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          calendarId: 'chosen@example.com',
          clientId: '123-abc.apps.googleusercontent.com',
          accessToken: 'expired-token',
          tokenExpiresAt: Date.now() - 1000
        }
      };
      loadData(JSON.stringify(project));
      fileHandle = { name: 'test.json', requestPermission: async () => 'granted', createWritable: async () => ({ write: async () => {}, close: async () => {} }) };
      showApp(); refreshAllTaskPanels();
    });
    await frame.waitForFunction(() => document.querySelector('#calendar-sync-button')?.title === 'Задачи синхронизированы.');
    assert.equal(await frame.evaluate(() => getSaveData().calendarSync.accessToken), 'shell-token');
    assert(calls.some(call => call.method === 'POST' && call.path.endsWith('/events')));
    console.log('PASS: opening Journey Book renews Google access and resumes sync from the project JSON.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
