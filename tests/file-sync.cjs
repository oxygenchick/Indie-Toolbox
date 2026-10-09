// Uses an isolated browser's private filesystem, never the user's project JSON.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
 const browser = await chromium.launch({headless:true,channel:process.env.PAINTING_BROWSER || 'msedge'});
 try {
  const page=await browser.newPage();
  await page.goto((process.env.PAINTING_TEST_URL || 'http://127.0.0.1:8765')+'/Tasks.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.documentElement.classList.contains('i18n-ready'));
  await page.evaluate(async()=>{
   loadData(JSON.stringify({tasks:[{text:'Existing task',done:false,days:['2026-10-05']}]}));
   showApp();refreshAllTaskPanels();switchTab('painting');
   const dir=await navigator.storage.getDirectory();
   window.testDiskHandle=await dir.getFileHandle('sync-test.json',{create:true});
   window.testPermission='denied';window.testWrites=0;window.permissionCalls=[];
   fileHandle={name:'sync-test.json',
    queryPermission:async()=>window.testPermission,
    requestPermission:async()=>{window.permissionCalls.push(navigator.userActivation.isActive);return window.testPermission},
    createWritable:async()=>{window.testWrites++;return window.testDiskHandle.createWritable()}
   };
  });
  await page.locator('[data-i18n="painting.addArea"]').click();
  await page.locator('input[name="areaName"]').fill('Saved with tasks');
  await page.locator('.painting-dialog button[type="submit"]').click();
  await page.evaluate(()=>saveQueue);
  assert.equal(await page.locator('#sync-error').isVisible(),true);
  assert.equal(await page.evaluate(()=>window.testWrites),0);
  assert.equal(await page.evaluate(()=>unsavedChanges),true);
  assert.equal(await page.evaluate(()=>painting.areas.length),1);
  assert.match(await page.locator('#sync-error-detail').textContent(),/NotAllowedError/);
  await page.evaluate(()=>window.testPermission='granted');
  await page.locator('[data-i18n="tasks.retrySave"]').click();
  await page.evaluate(()=>saveQueue);
  assert.equal(await page.locator('#sync-error').isVisible(),false);
  assert.equal(await page.evaluate(()=>unsavedChanges),false);
  const written=await page.evaluate(async()=>JSON.parse(await (await window.testDiskHandle.getFile()).text()));
  assert.equal(written.painting.areas[0].name,'Saved with tasks');
  assert.equal(written.tasks[0].text,'Existing task');
  assert.deepEqual(await page.evaluate(()=>window.permissionCalls),[true,true]);
  // Grant succeeds but the actual write fails (e.g. OS lock). Recover without losing data.
  await page.evaluate(async()=>{
   fileHandle.createWritable=async()=>{throw new DOMException('File is locked','NoModificationAllowedError')};
   tasks[0].areaId=painting.areas[0].id;tasks[0].layerId=painting.layers[0].id;
   await save();
  });
  assert.match(await page.locator('#sync-error-detail').textContent(),/NoModificationAllowedError/);
  await page.evaluate(()=>{
   window.showSaveFilePicker=async()=>window.testDiskHandle;
  });
  await page.locator('[data-i18n="tasks.saveCopy"]').click();
  await page.waitForFunction(()=>!unsavedChanges);
  const copy=await page.evaluate(async()=>JSON.parse(await (await window.testDiskHandle.getFile()).text()));
  assert.equal(copy.tasks[0].areaId,copy.painting.areas[0].id);
  assert.equal(copy.tasks[0].layerId,copy.painting.layers[0].id);
  // Opening explicitly requests write access rather than a default read-only handle.
  await page.evaluate(()=>{window.pickerOptions=null;window.showOpenFilePicker=async options=>{window.pickerOptions=options;return [window.testDiskHandle]}});
  await page.locator('.file-bar button').first().click();
  await page.waitForFunction(()=>window.pickerOptions!==null);
  assert.equal(await page.evaluate(()=>window.pickerOptions.mode),'readwrite');
  console.log('PASS: denied write, user activation, retry, native JSON write/read with tasks and painting, write failure, save-copy with assignments, readwrite picker.');
 } finally {await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
