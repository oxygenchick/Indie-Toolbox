const assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
 const browser = await chromium.launch({headless:true,channel:process.env.PAINTING_BROWSER || 'msedge'});
 try {
  const page=await browser.newPage({viewport:{width:1366,height:768},locale:'ru-RU'});
  await page.goto((process.env.PAINTING_TEST_URL || 'http://127.0.0.1:8765')+'/Tasks.html');
  await page.waitForFunction(()=>document.documentElement.classList.contains('i18n-ready'));
  await page.evaluate(()=>{
   loadData(JSON.stringify({painting:{areas:[{id:'a',name:'Игровой процесс'},{id:'b',name:'Звук'}],layers:[{id:'l1',name:'Основа'},{id:'l2',name:'Детали'}]},tasks:[
    {text:'Настроить детали звука',areaId:'b',layerId:'l2',days:['2026-10-05']},
    {text:'Очень длинное название задачи: проверить взаимодействие игрока с предметами и переходами между сценами, включая свет, звук и сохранение прогресса',areaId:'a',layerId:'l1',days:['2026-10-04']},
    {text:'Задача без области',days:[]},
    {text:'Задача без слоя',areaId:'a',days:[]},
    {text:'Завершённая задача',areaId:'a',layerId:'l2',days:['2026-10-05'],done:true},
    {text:'Другой месяц',areaId:'a',days:['2026-09-05'],done:true}
   ]}));
   ganttDate=new Date(2026,9,1);taskUICollapsed.ganttDoneHidden=false;
   showApp();switchTab('gantt');
  });
  const headings=await page.locator('.gantt-main-table-wrap .gantt-group-label').allTextContents();
  assert.deepEqual(headings,['Без области','Игровой процесс','Без слоя','1. Основа','Звук','2. Детали']);
  assert.equal(await page.locator('.gantt-done-inner-wrap .gantt-task-name').count(),1);
  const main=page.locator('.gantt-main-table-wrap');
  const area=main.getByRole('button',{name:'Игровой процесс',exact:true});
  const foundation=main.getByRole('button',{name:'1. Основа',exact:true});
  const originalDays=await page.evaluate(()=>tasks.map(t=>t.days));
  await foundation.click();
  assert.equal(await foundation.getAttribute('aria-expanded'),'false');
  assert.equal(await main.locator('.gantt-task-name').filter({hasText:'Очень длинное'}).count(),0);
  await area.click();
  assert.equal(await foundation.count(),0);
  assert.equal(await page.locator('.gantt-done-inner-wrap .gantt-task-name').count(),1);
  await area.press('Enter');
  assert.equal(await foundation.getAttribute('aria-expanded'),'false');
  await page.evaluate(()=>{ganttNext();ganttPrev()});
  assert.equal(await foundation.getAttribute('aria-expanded'),'false');
  assert.deepEqual(await page.evaluate(()=>readTaskUIState().ganttGroups),await page.evaluate(()=>taskUICollapsed.ganttGroups));
  await foundation.click();
  assert.equal(await foundation.getAttribute('aria-expanded'),'true');
  assert.deepEqual(await page.evaluate(()=>tasks.map(t=>t.days)),originalDays);
  const unassigned=main.getByRole('button',{name:'Без области',exact:true});
  await unassigned.click();
  assert.equal(await main.locator('.gantt-task-name').filter({hasText:'Задача без области'}).count(),0);
  await unassigned.click();
  const done=page.locator('.gantt-done-inner-wrap');
  await done.getByRole('button',{name:'2. Детали',exact:true}).click();
  assert.equal(await done.locator('.gantt-task-name').count(),0);
  await done.getByRole('button',{name:'2. Детали',exact:true}).click();
  const long=page.locator('.gantt-task-name').filter({hasText:'Очень длинное'});
  assert((await long.boundingBox()).height>50);
  const target=page.locator('.gantt-day[data-task-index="0"][data-date="2026-10-07"]');
  await target.click();
  assert.deepEqual(await page.evaluate(()=>tasks[0].days),['2026-10-05','2026-10-07']);
  assert.deepEqual(await page.evaluate(()=>tasks[1].days),['2026-10-04']);
  const from=await page.locator('.gantt-day[data-task-index="0"][data-date="2026-10-05"]').boundingBox();
  const to=await page.locator('.gantt-day[data-task-index="0"][data-date="2026-10-06"]').boundingBox();
  await page.mouse.move(from.x+from.width/2,from.y+from.height/2);
  await page.mouse.down();
  await page.mouse.move(to.x+to.width/2,to.y+to.height/2,{steps:5});
  await page.mouse.up();
  assert.deepEqual(await page.evaluate(()=>tasks[0].days),['2026-10-06','2026-10-07']);
  if(process.env.GANTT_SCREENSHOT)await page.screenshot({path:process.env.GANTT_SCREENSHOT});
  await page.setViewportSize({width:560,height:720});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.equal(await long.evaluate(e=>e.scrollWidth>e.clientWidth),false);
  await page.evaluate(()=>{ganttDate=new Date(2026,10,1);renderGantt()});
  assert.equal(await page.locator('.gantt-done-block').count(),0);
  assert.equal(await page.locator('.gantt-main-table-wrap .gantt-task-name').count(),4);
  console.log('PASS: group collapse/expand, nested and independent state, keyboard, persisted preferences, month switching, area/layer order, completed filtering, wrapped names, date editing, drag mapping and narrow window.');
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
