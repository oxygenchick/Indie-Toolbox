const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.PAINTING_BROWSER || 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 560, height: 450 }, locale: 'ru-RU' });
    await page.goto((process.env.PAINTING_TEST_URL || 'http://127.0.0.1:8765') + '/Tasks.html');
    await page.waitForFunction(() => document.documentElement.classList.contains('i18n-ready'));
    await page.evaluate(() => {
      loadData(JSON.stringify({ tasks: [
        { text: 'Задача для дат', days: [] },
        ...Array.from({ length: 22 }, (_, i) => ({ text: `Другая задача ${i + 1}`, days: ['2026-10-05'] }))
      ] }));
      ganttDate = new Date(2026, 9, 1);
      taskUICollapsed.ganttDatedOnly = true;
      showApp(); refreshAllTaskPanels(); switchTab('tasks');
    });

    const button = page.locator('.task-item[data-task-index="0"] .task-dates-button');
    assert.equal(await button.textContent(), 'Дата +');
    await button.click();
    await page.getByLabel('Дата / с').fill('2026-10-08');
    await page.getByLabel('По (необязательно)').fill('2026-10-10');
    await page.locator('.task-dates-dialog button[type="submit"]').click();
    assert.deepEqual(await page.evaluate(() => tasks[0].days), ['2026-10-08', '2026-10-09', '2026-10-10']);
    assert.equal(await button.textContent(), '08.10.2026 +2');
    await page.locator('#undo-btn').click();
    assert.deepEqual(await page.evaluate(() => tasks[0].days), []);
    await page.locator('#redo-btn').click();
    assert.deepEqual(await page.evaluate(() => tasks[0].days), ['2026-10-08', '2026-10-09', '2026-10-10']);
    await page.locator('[data-tab="gantt"]').click();
    assert.equal(await page.locator('.gantt-task-row[data-task-index="0"] .gantt-day.filled').count(), 3);

    await page.locator('[data-tab="tasks"]').click();
    await button.click();
    assert.equal(await page.locator('.task-dates-selected .task-date-item').count(), 3);
    await page.getByLabel('Убрать 10.10.2026').click();
    await page.getByLabel('Дата / с').fill('2026-10-12');
    await page.locator('.task-dates-dialog').getByRole('button', { name: 'Добавить' }).click();
    await page.locator('.task-dates-dialog button[type="submit"]').click();
    assert.deepEqual(await page.evaluate(() => tasks[0].days), ['2026-10-08', '2026-10-09', '2026-10-12']);
    await page.locator('[data-tab="gantt"]').click();
    await page.locator('.gantt-day[data-task-index="0"][data-date="2026-10-11"]').click();
    assert.deepEqual(await page.evaluate(() => tasks[0].days), ['2026-10-08', '2026-10-09', '2026-10-11', '2026-10-12']);
    await page.locator('[data-tab="tasks"]').click();
    assert.equal(await button.textContent(), '08.10.2026 +3');
    await button.click();
    assert.equal(await page.locator('.task-dates-selected .task-date-item').count(), 4);
    await page.locator('.task-dates-dialog').getByRole('button', { name: 'Отмена' }).click();

    await page.locator('[data-tab="gantt"]').click();
    const before = await page.evaluate(() => {
      const wrap = document.querySelector('.gantt-main-table-wrap');
      wrap.scrollLeft = 100;
      wrap.scrollTop = 120;
      const box = wrap.getBoundingClientRect();
      const cell = document.elementFromPoint(box.left + 300, box.top + 65)?.closest('.gantt-day');
      if (!cell) throw new Error('Expected a visible Gantt day cell');
      const rect = cell.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, left: wrap.scrollLeft, top: wrap.scrollTop };
    });
    assert(before.left > 0 && before.top > 0);
    await page.mouse.click(before.x, before.y);
    assert.deepEqual(await page.evaluate(() => {
      const wrap = document.querySelector('.gantt-main-table-wrap');
      return { left: wrap.scrollLeft, top: wrap.scrollTop };
    }), { left: before.left, top: before.top });

    const snapshot = await page.evaluate(() => snapshotData());
    assert.deepEqual(JSON.parse(snapshot).tasks[0].days, ['2026-10-08', '2026-10-09', '2026-10-11', '2026-10-12']);
    await page.locator('[data-tab="tasks"]').click();
    await button.click();
    await page.locator('.task-dates-dialog').getByRole('button', { name: 'Очистить даты' }).click();
    await page.locator('.task-dates-dialog button[type="submit"]').click();
    assert.deepEqual(await page.evaluate(() => tasks[0].days), []);
    assert.equal(await button.textContent(), 'Дата +');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    console.log('PASS: task date/range editing, individual removal, Gantt-to-task sync, JSON dates, and Gantt scroll position.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
