const assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
 const browser = await chromium.launch({headless:true,channel:process.env.PAINTING_BROWSER || 'msedge'});
 try {
  const page=await browser.newPage({viewport:{width:1366,height:768},locale:'ru-RU'});
  await page.route('https://**/*',route=>route.abort());
  await page.goto((process.env.PAINTING_TEST_URL || 'http://127.0.0.1:8765')+'/Tasks.html');
  await page.waitForFunction(()=>document.documentElement.classList.contains('i18n-ready'));
  await page.evaluate(()=>{
   loadData(JSON.stringify({painting:{areas:[{id:'a',name:'Игровой процесс'},{id:'b',name:'Звук'}],layers:[{id:'l1',name:'Основа'},{id:'l2',name:'Детали'}]},tasks:[
    {text:'Настроить детали звука',areaId:'b',layerId:'l2',days:['2026-10-05']},
    {text:'Очень длинное название задачи: проверить взаимодействие игрока с предметами и переходами между сценами, включая свет, звук и сохранение прогресса',areaId:'a',layerId:'l1',days:['2026-10-04']},
    {text:'Задача без области',days:[]},
    {text:'Задача без слоя',areaId:'a',days:[]},
    {text:'Дата в сентябре',areaId:'a',days:['2026-09-12']},
    {text:'Завершённая задача',areaId:'a',layerId:'l2',days:['2026-10-05'],done:true},
    {text:'Другой месяц',areaId:'a',days:['2026-09-05'],done:true}
   ]}));
   ganttDate=new Date(2026,9,1);taskUICollapsed.ganttDoneHidden=false;taskUICollapsed.ganttDatedOnly=false;
   showApp();switchTab('gantt');
  });
  const headings=await page.locator('.gantt-main-table-wrap .gantt-group-label').allTextContents();
  assert.deepEqual(headings,['Без области','Игровой процесс','Без слоя','1. Основа','Звук','2. Детали']);
  assert.equal(await page.locator('.gantt-done-inner-wrap .gantt-task-name').count(),1);
  assert.equal(await page.locator('.gantt-main-table-wrap .gantt-date-hdr:has([data-gantt-date-filter="2026-10-05"])').locator('.gantt-date-dot').count(),2);
  assert.equal(await page.locator('.gantt-main-table-wrap .gantt-date-hdr:has([data-gantt-date-filter="2026-10-05"])').locator('.gantt-date-dot.is-done').count(),1);
  assert.equal(await page.locator('.gantt-done-inner-wrap .gantt-date-hdr:has([data-gantt-date-filter="2026-10-05"])').locator('.gantt-date-dot').count(),1);
  const datedToggle=page.locator('#gantt-dated-toggle');
  assert.equal(await datedToggle.textContent(),'Только с датами этого месяца');
  assert.equal(await datedToggle.getAttribute('aria-pressed'),'false');
  await datedToggle.click();
  assert.equal(await datedToggle.getAttribute('aria-pressed'),'true');
  assert.deepEqual(await page.locator('.gantt-main-table-wrap .gantt-task-name > span').allTextContents(),[
   'Очень длинное название задачи: проверить взаимодействие игрока с предметами и переходами между сценами, включая свет, звук и сохранение прогресса',
   'Настроить детали звука'
  ]);
  assert.deepEqual(await page.locator('.gantt-main-table-wrap .gantt-group-label').allTextContents(),['Игровой процесс','1. Основа','Звук','2. Детали']);
  assert.equal(await page.locator('.gantt-done-inner-wrap .gantt-task-name').count(),1);
  assert.equal(await page.evaluate(()=>readTaskUIState().ganttDatedOnly),true);
  await page.evaluate(()=>ganttNext());
  assert.equal(await page.locator('.gantt-main-table-wrap .gantt-task-name').count(),0);
  assert.equal(await page.locator('.gantt-main-table-wrap .gantt-group-label').count(),0);
  assert.equal(await page.locator('.gantt-empty-row').count(),1);
  await page.evaluate(()=>ganttPrev());
  assert.equal(await page.locator('.gantt-main-table-wrap .gantt-task-name').count(),2);
  await page.evaluate(()=>ganttPrev());
  assert.deepEqual(await page.locator('.gantt-main-table-wrap .gantt-task-name > span').allTextContents(),['Дата в сентябре']);
  await page.evaluate(()=>ganttNext());
  await datedToggle.click();
  assert.equal(await datedToggle.getAttribute('aria-pressed'),'false');
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
  assert.equal(await main.locator('.gantt-date-hdr:has([data-gantt-date-filter="2026-11-01"]) .gantt-date-label').textContent(),'1');
  assert.deepEqual(await main.locator('.gantt-month-hdr').allTextContents(),['Сентябрь 2026','Октябрь 2026','Ноябрь 2026','Декабрь 2026']);
  await main.evaluate(el=>{el.scrollLeft+=ganttColumnWidth(el)*2.4});
  await page.waitForTimeout(800);
  assert(await main.evaluate(el=>{const w=ganttColumnWidth(el),n=el.scrollLeft/w;return Math.abs(n-Math.round(n))<0.05&&Math.abs((el.clientWidth-el.querySelector('th.gantt-task-hdr').getBoundingClientRect().width)/w-Math.round((el.clientWidth-el.querySelector('th.gantt-task-hdr').getBoundingClientRect().width)/w))<0.05}));
  await main.evaluate(el=>{el.scrollLeft=(ganttDayNumber('2026-10-05')-ganttRenderedStart)*ganttColumnWidth(el)});
  await page.waitForTimeout(300);
  assert.equal(await page.locator('#gantt-month-label').textContent(),'Октябрь 2026');
  const crossFrom=await page.locator('.gantt-day[data-task-index="0"][data-date="2026-10-07"]').boundingBox();
  const crossTo=await page.locator('.gantt-day[data-task-index="0"][data-date="2026-11-02"]').boundingBox();
  await page.mouse.move(crossFrom.x+crossFrom.width/2,crossFrom.y+crossFrom.height/2);
  await page.mouse.down();
  await page.mouse.move(crossTo.x+crossTo.width/2,crossTo.y+crossTo.height/2,{steps:8});
  await page.mouse.up();
  assert.deepEqual(await page.evaluate(()=>tasks[0].days),['2026-11-01','2026-11-02']);
  const panStart=await page.locator('.gantt-day[data-task-index="1"][data-date="2026-11-02"]').boundingBox();
  const panDays=await main.evaluate(el=>Math.ceil(800/ganttColumnWidth(el)));
  assert(panDays>28);
  await page.mouse.move(panStart.x+panStart.width/2,panStart.y+panStart.height/2);
  await page.mouse.down();
  await page.mouse.move(panStart.x-800,panStart.y+panStart.height/2,{steps:8});
  await page.mouse.up();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('#gantt-month-label').textContent(),'Ноябрь 2026');
  assert.equal(await page.evaluate(()=>ganttDate.getMonth()),10);
  assert.deepEqual(await page.evaluate(()=>tasks[1].days),['2026-10-04']);
  const headerAnchor=await page.evaluate(()=>ganttAnchor);
  const header=await main.locator('.gantt-date-hdr:has([data-gantt-date-filter="2026-11-20"])').boundingBox();
  await page.mouse.move(header.x+header.width/2,header.y+header.height/2);
  await page.mouse.down();
  await page.mouse.move(header.x+header.width/2+150,header.y+header.height/2,{steps:5});
  await page.mouse.up();
  await page.waitForTimeout(500);
  assert(await page.evaluate(before=>ganttAnchor<=before-4,headerAnchor));
  assert.equal(await page.evaluate(()=>ganttSelectedDay),null);
  assert.equal(await page.locator('.tab-bar').evaluate(el=>el.scrollHeight>el.clientHeight),false);
  await page.evaluate(()=>{ganttDate=new Date(2026,9,1);renderGantt()});
  if(process.env.GANTT_SCREENSHOT)await page.screenshot({path:process.env.GANTT_SCREENSHOT});
  await page.setViewportSize({width:560,height:720});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.equal(await long.evaluate(e=>e.scrollWidth>e.clientWidth),false);
  await page.evaluate(()=>{ganttDate=new Date(2026,10,1);renderGantt()});
  assert.equal(await page.locator('.gantt-done-block').count(),0);
  assert.equal(await page.locator('.gantt-main-table-wrap .gantt-task-name').count(),5);
  await page.evaluate(()=>{
   tasks=Array.from({length:9},(_,i)=>({text:'Task '+i,days:['2026-10-05'],done:false}));
   ganttDate=new Date(2026,9,1);renderGantt();
  });
  const dayHeader=page.locator('.gantt-main-table-wrap .gantt-date-hdr:has([data-gantt-date-filter="2026-10-05"])');
  assert.equal(await dayHeader.locator('.gantt-date-dot').count(),6);
  assert.match(await dayHeader.getAttribute('title'),/Задач: 9/);
  assert.equal(await dayHeader.evaluate(header=>{
   const number=header.querySelector('.gantt-date-label').getBoundingClientRect();
   const dots=header.querySelector('.gantt-date-dots').getBoundingClientRect();
   return Math.abs((number.left+number.right)/2-(dots.left+dots.right)/2)<1 && dots.top>=number.bottom;
  }),true);
  await page.evaluate(()=>{ taskUICollapsed.ganttDoneHidden=true; renderGantt(); });
  const check=page.locator('.gantt-main-table-wrap .gantt-task-row[data-task-index="0"] input[type="checkbox"]');
  await check.click();
  assert.equal(await page.evaluate(()=>tasks[0].done),true);
  assert.deepEqual(await page.evaluate(()=>tasks[0].days),['2026-10-05']);
  assert.equal(await dayHeader.locator('.gantt-date-dot').count(),6);
  assert.equal(await dayHeader.locator('.gantt-date-dot.is-done').count(),1);
  assert.equal(await page.locator('#gantt-done-inner').isVisible(),false);
  await page.locator('#undo-btn').click();
  assert.equal(await dayHeader.locator('.gantt-date-dot.is-done').count(),0);
  await page.locator('#redo-btn').click();
  assert.equal(await dayHeader.locator('.gantt-date-dot.is-done').count(),1);
  await page.locator('.gantt-done-block > button').click();
  await page.locator('.gantt-done-inner-wrap input[type="checkbox"]').click();
  assert.equal(await page.evaluate(()=>tasks[0].done),false);
  assert.equal(await dayHeader.locator('.gantt-date-dot').count(),6);
  assert.equal(await dayHeader.locator('.gantt-date-dot.is-done').count(),0);
  const calendarFont=await page.locator('.gantt-task-name > span').first().evaluate(el=>getComputedStyle(el).fontSize);
  await page.locator('[data-tab="tasks"]').click();
  assert.equal(await page.locator('.task-text').first().evaluate(el=>getComputedStyle(el).fontSize),calendarFont);
  await page.locator('.task-item[data-task-index="0"] input[type="checkbox"]').click();
  await page.locator('[data-tab="gantt"]').click();
  assert.equal(await dayHeader.locator('.gantt-date-dot.is-done').count(),1);
  await page.evaluate(()=>{ const data=snapshotData(); loadData(data); refreshAllTaskPanels(); });
  assert.equal(await dayHeader.locator('.gantt-date-dot').count(),6);
  assert.equal(await dayHeader.locator('.gantt-date-dot.is-done').count(),1);
  console.log('PASS: calendar completion/reopening, persistent hollow/filled dots, undo/redo, matching fonts, groups, filters, dates, dragging and narrow layout.');
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
