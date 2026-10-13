const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const project = {
  painting: { areas: [{ id: 'a', name: 'Область А' }, { id: 'b', name: 'Область Б' }], layers: [{ id: 'l1', name: 'Основа' }, { id: 'l2', name: 'Детали' }] },
  tasks: [
    { text: 'Первая', areaId: 'a', layerId: 'l1', days: ['2026-10-05'] },
    { text: 'Вторая', areaId: 'b', layerId: 'l2', days: ['2026-10-05'] },
    { text: 'Другой день', areaId: 'a', layerId: 'l2', days: ['2026-10-06'] },
    { text: 'Готовая', areaId: 'a', layerId: 'l1', days: ['2026-10-05'], done: true }
  ]
};
(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.PAINTING_BROWSER || 'msedge' });
  try {
    const context = await browser.newContext({ viewport: { width: 1000, height: 720 }, locale: 'ru-RU' });
    const page = await context.newPage();
    await page.route('https://**/*', route => route.abort());
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const url = (process.env.PAINTING_TEST_URL || 'http://127.0.0.1:8765') + '/Tasks.html';
    async function openProject() {
      await page.goto(url);
      await page.waitForFunction(() => document.documentElement.classList.contains('i18n-ready'));
      await page.evaluate(data => {
        loadData(JSON.stringify(data)); ganttDate = new Date(2026, 9, 1);
        showApp(); refreshAllTaskPanels(); switchTab('tasks');
      }, project);
    }
    await openProject();
    const area = page.locator('#tasks-active-area > details').filter({ has: page.locator(':scope > summary', { hasText: 'Область А' }) });
    const layer = area.locator('details').filter({ has: page.locator(':scope > summary', { hasText: '1. Основа' }) });
    await layer.locator(':scope > summary').click();
    await area.locator(':scope > summary').click();
    await page.locator('#task-done-toggle').click();
    await page.locator('[data-tab="gantt"]').click();
    await page.locator('.gantt-main-table-wrap').getByRole('button', { name: 'Область А', exact: true }).click();
    const savedGroups = await page.evaluate(() => JSON.parse(localStorage.getItem(PAINTING_GROUPS_UI_KEY)));
    assert(savedGroups.includes('o:a') && savedGroups.includes('o:a:l1'));
    await openProject();
    assert.equal(await area.evaluate(el => el.open), false);
    assert.equal(await layer.evaluate(el => el.open), false);
    assert.equal(await page.locator('#task-done-inner').isVisible(), false);
    await page.locator('[data-tab="gantt"]').click();
    const main = page.locator('.gantt-main-table-wrap');
    assert.equal(await main.getByRole('button', { name: 'Область А', exact: true }).getAttribute('aria-expanded'), 'false');
    const groupsBefore = await page.evaluate(() => JSON.stringify(taskUICollapsed.ganttGroups));
    const date = day => main.locator(`[data-gantt-date-filter="2026-10-${day}"]`);
    await date('05').click();
    assert.equal(await date('05').getAttribute('aria-pressed'), 'true');
    assert.deepEqual(await main.locator('.gantt-task-name > span').allTextContents(), ['Первая', 'Вторая', 'Готовая']);
    assert.equal(await page.locator('.gantt-group-toggle, .gantt-done-block').count(), 0);
    if (process.env.TASK_UI_SCREENSHOT) await page.screenshot({ path: process.env.TASK_UI_SCREENSHOT });
    await main.locator('[data-task-index="0"] .gantt-task-check').click();
    assert.equal(await main.locator('.gantt-task-row').count(), 3);
    assert.equal(await date('05').locator('.is-done').count(), 2);
    await date('06').click();
    assert.deepEqual(await main.locator('.gantt-task-name > span').allTextContents(), ['Другой день']);
    await date('06').press('Enter');
    assert.equal(await date('06').getAttribute('aria-pressed'), 'false');
    assert.equal(await main.getByRole('button', { name: 'Область А', exact: true }).getAttribute('aria-expanded'), 'false');
    assert.equal(await page.evaluate(() => JSON.stringify(taskUICollapsed.ganttGroups)), groupsBefore);
    await date('07').click();
    assert.equal(await main.locator('.gantt-task-row').count(), 0);
    assert.equal(await main.locator('.gantt-empty-row').count(), 1);
    await page.evaluate(() => ganttNext());
    assert.equal(await page.evaluate(() => ganttSelectedDay), null);
    assert.equal(await main.locator('[aria-pressed="true"]').count(), 0);
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem(PAINTING_GROUPS_UI_KEY))), savedGroups);
    assert.deepEqual(errors, []);
    console.log('PASS: section state survives page reopening; date filter shows flat open/completed tasks, switches dates, toggles with keyboard, preserves collapsed groups, handles empty days and month navigation.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
