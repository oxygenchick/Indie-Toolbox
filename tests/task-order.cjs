const assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
 const browser = await chromium.launch({ headless: true, channel: process.env.PAINTING_BROWSER || 'msedge' });
 try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, locale: 'ru-RU' });
  await page.goto((process.env.PAINTING_TEST_URL || 'http://127.0.0.1:8765') + '/Tasks.html');
  await page.waitForFunction(() => document.documentElement.classList.contains('i18n-ready'));
  await page.evaluate(() => {
   loadData(JSON.stringify({
    painting: { areas: [{id:'area-a',name:'Геймплей'},{id:'area-b',name:'Звук'}], layers:[{id:'layer-a',name:'Основа'}] },
    tasks: [
     {text:'Первая задача',areaId:'area-a',layerId:'layer-a',days:['2026-10-07']},
     {text:'Вторая задача',areaId:'area-a',layerId:'layer-a',days:['2026-10-05']},
     {text:'Третья задача',areaId:'area-a',layerId:'layer-a',days:['2026-10-06']},
     {text:'Задача другой области',areaId:'area-b',layerId:'layer-a',days:['2026-10-05']}
    ]
   }));
   ganttDate = new Date(2026,9,1);
   showApp(); refreshAllTaskPanels(); switchTab('tasks');
  });
  const listOrder = () => page.locator('#tasks-active-area .task-text').allTextContents();
  const ganttOrder = () => page.locator('.gantt-main-table-wrap .gantt-task-name > span').allTextContents();
  assert.deepEqual(await listOrder(),['Первая задача','Вторая задача','Третья задача','Задача другой области']);
  const dates = await page.evaluate(() => tasks.map(task => [...task.days]));
  assert.equal(await page.locator('.task-order-handle').count(), 0);
  assert.equal(await page.locator('#tasks-active-area .task-item[draggable="true"]').count(), 4);

  // Keyboard ordering moves one position and updates Gantt.
  await page.locator('#tasks-active-area .task-item[data-order-task="0"]').focus();
  await page.keyboard.press('Alt+ArrowDown');
  assert.deepEqual(await listOrder(),['Вторая задача','Первая задача','Третья задача','Задача другой области']);
  await page.locator('[data-tab="gantt"]').click();
  assert.deepEqual(await ganttOrder(),await listOrder());
  assert.equal(await page.locator('.gantt-main-table-wrap button.task-order-handle').count(), 0);

  // Dragging a task name inserts it before the target; middle tasks shift instead of swapping.
  await page.locator('.gantt-main-table-wrap .gantt-task-name[data-order-task="2"]').dragTo(
    page.locator('.gantt-main-table-wrap .gantt-task-row[data-task-index="1"] .gantt-task-name'),
    { targetPosition: { x: 40, y: 2 } }
  );
  assert.deepEqual(await ganttOrder(),['Третья задача','Вторая задача','Первая задача','Задача другой области']);
  await page.locator('[data-tab="tasks"]').click();
  assert.deepEqual(await listOrder(),await ganttOrder());

  // Dragging the whole list row inserts after the target.
  const targetRow = page.locator('#tasks-active-area .task-item[data-task-index="0"]');
  const targetHeight = await targetRow.evaluate(row => row.getBoundingClientRect().height);
  await page.locator('#tasks-active-area .task-item[data-task-index="2"]').dragTo(targetRow, { targetPosition: { x: 50, y: targetHeight - 2 } });
  assert.deepEqual(await listOrder(),['Вторая задача','Первая задача','Третья задача','Задача другой области']);

  // A different area needs an explicit category change; a drag leaves both groups intact.
  await page.locator('#tasks-active-area .task-item[data-task-index="3"]').dragTo(
    page.locator('#tasks-active-area .task-item[data-task-index="0"]')
  );
  assert.deepEqual(await listOrder(),['Вторая задача','Первая задача','Третья задача','Задача другой области']);
  assert.deepEqual(await page.evaluate(() => tasks.map(task => task.days)),dates);

  await page.locator('#undo-btn').click();
  assert.deepEqual(await listOrder(),['Третья задача','Вторая задача','Первая задача','Задача другой области']);
  await page.locator('#redo-btn').click();
  assert.deepEqual(await listOrder(),['Вторая задача','Первая задача','Третья задача','Задача другой области']);
  const snapshot = await page.evaluate(() => snapshotData());
  await page.evaluate(data => { loadData(data); refreshAllTaskPanels(); },snapshot);
  assert.deepEqual(await listOrder(),['Вторая задача','Первая задача','Третья задача','Задача другой области']);
  assert.deepEqual(await page.evaluate(() => tasks.map(task => task.days)),dates);

  // Legacy files without order values acquire their existing array order.
  assert.deepEqual(await page.evaluate(() => {loadData(JSON.stringify([{text:'Старая A'},{text:'Старая B'}]));return tasks.map(task => task.order)}),[0,1]);
  await page.evaluate(() => {
   loadData(JSON.stringify({tasks:[
    {text:'Месяц: первая',days:['2026-10-07']},
    {text:'Месяц: вторая',days:['2026-10-05']},
    {text:'Другой месяц',days:['2026-11-01']}
   ]}));
   render(); renderGantt();
  });
  await page.locator('#tasks-active-area .task-item[data-order-task="0"]').focus();
  await page.keyboard.press('Alt+ArrowDown');
  assert.deepEqual(await listOrder(),['Месяц: вторая','Месяц: первая','Другой месяц']);
  await page.locator('[data-tab="gantt"]').click();
  assert.deepEqual(await ganttOrder(),['Месяц: вторая','Месяц: первая','Другой месяц']);
  await page.evaluate(() => {
   loadData(JSON.stringify({tasks:[
    {text:'Ноябрь',days:['2026-11-01']},
    {text:'Октябрь 1',days:['2026-10-05']},
    {text:'Октябрь 2',days:['2026-10-06']}
   ]}));
   render(); renderGantt();
  });
  await page.locator('[data-tab="tasks"]').click();
  assert.deepEqual(await listOrder(),['Октябрь 1','Октябрь 2','Ноябрь']);
  await page.locator('[data-tab="gantt"]').click();
  assert.deepEqual(await ganttOrder(),await listOrder());
  console.log('PASS: row drag, insertion without swapping, Gantt drag, keyboard reorder, shared order, group boundary, dates, undo/redo, JSON roundtrip and legacy files.');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
