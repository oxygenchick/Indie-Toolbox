const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.PAINTING_BROWSER || 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 720 }, locale: 'ru-RU' });
    const events = new Map();
    const calls = [];
    await page.route('https://accounts.google.com/gsi/client', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
    await page.route('https://www.googleapis.com/calendar/v3/**', async route => {
      const req = route.request();
      const url = new URL(req.url());
      calls.push({ method: req.method(), path: url.pathname, search: url.search });
      if (url.pathname.endsWith('/calendarList')) {
        return route.fulfill({ json: { items: [{ id: 'chosen@example.com', summary: 'Задачи', accessRole: 'owner' }] } });
      }
      const root = '/calendar/v3/calendars/chosen%40example.com/events';
      assert(url.pathname.startsWith(root), 'Only the chosen calendar can be changed');
      if (req.method() === 'GET') {
        const match = url.searchParams.get('privateExtendedProperty');
        return route.fulfill({ json: { items: [...events.values()].filter(event => match === 'indietoolboxProject=' + event.extendedProperties?.private?.indietoolboxProject) } });
      }
      if (req.method() === 'POST') {
        const event = req.postDataJSON();
        if (events.has(event.id)) return route.fulfill({ status: 409, json: { error: { message: 'duplicate' } } });
        events.set(event.id, event);
        return route.fulfill({ json: event });
      }
      const id = decodeURIComponent(url.pathname.slice(root.length + 1));
      if (req.method() === 'DELETE') { events.delete(id); return route.fulfill({ status: 204, body: '' }); }
      if (req.method() === 'PATCH') {
        Object.assign(events.get(id), req.postDataJSON());
        return route.fulfill({ json: events.get(id) });
      }
      throw new Error(req.method());
    });
    await page.goto((process.env.PAINTING_TEST_URL || 'http://127.0.0.1:8765') + '/Tasks.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.documentElement.classList.contains('i18n-ready'));
    await page.evaluate(() => {
      window.google = { accounts: { oauth2: { initTokenClient: settings => ({ requestAccessToken: () => settings.callback({ access_token: 'test-token' }) }) } } };
      loadData(JSON.stringify({ tasks: [{ text: 'Первое имя', days: ['2026-10-08', '2026-10-10'] }] }));
      fileHandle = { name: 'test.json', requestPermission: async () => 'granted', createWritable: async () => ({ write: async () => {}, close: async () => {} }) };
      showApp(); refreshAllTaskPanels();
    });
    await page.locator('#calendar-sync-button').click();
    await page.locator('[data-calendar-client]').fill('123-abc.apps.googleusercontent.com');
    await page.getByRole('button', { name: 'Подключить Google' }).click();
    await page.getByRole('button', { name: 'Использовать этот календарь' }).click();
    await page.waitForFunction(() => document.querySelector('[data-calendar-status]')?.textContent === 'Задачи синхронизированы.');
    assert.equal(events.size, 2);
    assert.deepEqual([...events.values()].map(event => event.start.date).sort(), ['2026-10-08', '2026-10-10']);
    assert([...events.values()].every(event => event.end.date > event.start.date));
    assert.equal(await page.evaluate(() => getSaveData().calendarSync.calendarId), 'chosen@example.com');
    const id = await page.evaluate(() => tasks[0].id);
    assert.match(id, /^[0-9a-f-]{36}$/);
    events.set('unrelated', { id: 'unrelated', summary: 'Личное событие' });

    await page.evaluate(async () => { tasks[0].text = 'Новое имя'; tasks[0].days = ['2026-10-10']; await save(); });
    await page.waitForTimeout(700);
    assert.equal(events.size, 2);
    assert.equal([...events.values()].find(event => event.id !== 'unrelated').summary, 'Новое имя');
    await page.evaluate(async () => { tasks.splice(0, 1); await save(); });
    await page.waitForTimeout(700);
    assert.deepEqual([...events.keys()], ['unrelated']);
    assert(calls.some(call => call.method === 'PATCH'));
    assert(calls.some(call => call.method === 'DELETE'));
    console.log('PASS: Google Calendar selection, all-day copies, updates, removals, and project JSON config.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
