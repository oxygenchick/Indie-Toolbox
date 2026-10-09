/* Run against a local static server with Playwright available in NODE_PATH.
   PAINTING_TEST_URL defaults to http://127.0.0.1:8765. No user files are opened. */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = process.env.PAINTING_TEST_URL || 'http://127.0.0.1:8765';

(async () => {
    const browser = await chromium.launch({ headless: true, channel: process.env.PAINTING_BROWSER || 'msedge' });
    try {
        const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, locale: 'ru-RU' });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/www.googletagmanager.com/**', route => route.abort());
        await page.goto(base + '/Tasks.html');
        await page.waitForFunction(() => document.documentElement.classList.contains('i18n-ready'));
        await page.evaluate(async () => {
            await I18n.setLang('ru');
            applyTabLabels();
            loadData(JSON.stringify([{ text: 'Старая задача', done: false, days: ['2026-10-05'] }]));
            showApp(); refreshAllTaskPanels();
        });
        assert.equal(await page.locator('.task-text').textContent(), 'Старая задача');
        assert.equal(await page.locator('select[data-field="layerId"]').isDisabled(), true);
        assert.equal(await page.evaluate(() => painting.layers.length), 4);
        await page.locator('[data-tab="painting"]').click();
        assert.equal(await page.locator('.painting-empty').count(), 1);

        for (const name of ['Игровой процесс', 'Визуальный мир', 'Звук и музыка', 'Выпуск игры']) {
            await page.locator('[data-i18n="painting.addArea"]').click();
            await page.locator('input[name="areaName"]').fill(name);
            await page.locator('.painting-dialog button[type="submit"]').click();
        }
        assert.equal(await page.locator('.painting-area').count(), 4);
        assert.deepEqual(await page.locator('.painting-area-count').allTextContents(), ['Задач: 0', 'Задач: 0', 'Задач: 0', 'Задач: 0']);
        await page.locator('[data-i18n="painting.layers"]').click();
        await page.locator('.painting-layer-count input').fill('3');
        await page.locator('.painting-layer-count input').press('Tab');
        await page.locator('.painting-layer-edit-row input').first().fill('Черновик');
        await page.locator('.painting-dialog button[type="submit"]').click();
        assert.equal(await page.evaluate(() => painting.layers.length), 3);
        assert.equal(await page.locator('.painting-band-label').first().textContent(), 'Черновик');

        await page.locator('[data-tab="tasks"]').click();
        const areaId = await page.evaluate(() => painting.areas[0].id);
        const layerId = await page.evaluate(() => painting.layers[0].id);
        await page.locator('select[data-field="areaId"]').selectOption(areaId);
        assert.equal(await page.locator('.painting-area-count').first().textContent(), 'Задач: 1');
        assert.equal(await page.locator('select[data-field="layerId"]').isDisabled(), false);
        assert(await page.locator('#tasks-active-area').innerText().then(t => t.includes('Без слоя')));
        await page.locator('select[data-field="layerId"]').selectOption(layerId);
        assert(await page.locator('#tasks-active-area').innerText().then(t => t.includes('1. Черновик')));
        await page.locator('#undo-btn').click();
        assert.equal(await page.evaluate(() => tasks[0].layerId), null);
        await page.locator('#redo-btn').click();
        assert.equal(await page.evaluate(() => tasks[0].layerId), layerId);

        // A real task has one completion state in the list and the painting.
        await page.locator('.task-item input[type="checkbox"]').check();
        await page.locator('[data-tab="painting"]').click();
        assert.equal(await page.locator('.painting-area-count').first().textContent(), 'Задач: 1');
        assert.equal(await page.locator('.painting-stroke.is-done').count(), 1);
        await page.locator('.painting-stroke').hover();
        assert.match(await page.locator('#painting-task-preview').innerText(), /Старая задача/);
        await page.locator('.painting-stroke').click();
        await page.locator('[data-i18n="painting.layers"]').hover();
        assert.match(await page.locator('#painting-task-preview').innerText(), /Старая задача/);
        assert.equal(await page.locator('[data-tab="painting"]').getAttribute('class'), 'tab active');

        // Dense areas, including fifteen tasks in a single band.
        await page.evaluate(() => {
            tasks = [];
            [10, 4, 15, 7].forEach((count, areaIndex) => {
                for (let n = 0; n < count; n++) tasks.push({
                    text: ['Настроить взаимодействие с предметами', 'Нарисовать окружение станции', 'Записать звук шагов по поверхности', 'Подготовить страницу игры'][areaIndex] + ' ' + (n + 1),
                    done: n % 3 === 0,
                    days: ['2026-10-05'], areaId: painting.areas[areaIndex].id,
                    layerId: painting.layers[areaIndex === 2 ? 0 : n % 3].id
                });
            });
            resetHistory(); render();
        });
        assert.equal(await page.locator('.painting-stroke').count(), 36);
        assert.deepEqual(await page.locator('.painting-area-count').allTextContents(), ['Задач: 10', 'Задач: 4', 'Задач: 15', 'Задач: 7']);
        assert.equal(await page.locator('.painting-area').nth(2).locator('.painting-band').first().locator('.painting-stroke').count(), 15);
        for (const [width, height] of [[1920, 1080], [1366, 768], [1120, 630]]) {
            await page.setViewportSize({ width, height });
            await page.waitForTimeout(100);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
            assert.equal(await page.evaluate(() => [...document.querySelectorAll('.painting-strokes')].some(e => e.scrollWidth > e.clientWidth)), false);
            assert.equal(await page.evaluate(() => document.querySelector('.painting-scroll').scrollHeight > document.querySelector('.painting-scroll').clientHeight), false);
        }
        if (process.env.PAINTING_SCREENSHOT) await page.screenshot({ path: process.env.PAINTING_SCREENSHOT });
        await page.locator('[data-tab="tasks"]').click();
        if (process.env.PAINTING_SCREENSHOT) await page.screenshot({ path: process.env.PAINTING_SCREENSHOT.replace('.png', '-tasks.png') });
        await page.locator('#add-input').fill('Новая несортированная задача');
        await page.locator('#add-input').press('Enter');
        assert.equal(await page.evaluate(() => tasks.at(-1).areaId), null);
        assert.equal(await page.evaluate(() => tasks.at(-1).layerId), null);
        await page.locator('[data-tab="painting"]').click();

        // Earlier layers determine the hatching, including reopening a base task.
        await page.evaluate(() => {
            tasks = [
                { id: paintingId(), text: 'Основа', done: false, days: [], areaId: painting.areas[0].id, layerId: painting.layers[0].id, order: 0 },
                { id: paintingId(), text: 'Сборка', done: true, days: [], areaId: painting.areas[0].id, layerId: painting.layers[1].id, order: 1 }
            ]; render();
        });
        assert.equal(await page.locator('.painting-stroke.is-early').count(), 1);
        await page.evaluate(() => toggleTask(0));
        assert.equal(await page.locator('.painting-stroke.is-early').count(), 0);
        await page.evaluate(() => toggleTask(0));
        assert.equal(await page.locator('.painting-stroke.is-early').count(), 1);
        const snapshot = await page.evaluate(() => snapshotData());
        await page.locator('[data-i18n="painting.layers"]').click();
        await page.locator('.painting-layer-edit-row').first().getByRole('button', { name: 'Удалить слой', exact: true }).click();
        await page.locator('.painting-dialog button[type="submit"]').click();
        assert.equal(await page.evaluate(() => tasks[0].layerId), null);
        assert.equal(await page.evaluate(() => tasks.length), 2);
        await page.locator('#undo-btn').click();
        assert.equal(await page.evaluate(() => snapshotData()), snapshot);
        await page.locator('[data-i18n="painting.layers"]').click();
        await page.locator('.painting-layer-edit-row input').first().fill('Не сохранять');
        await page.keyboard.press('Escape');
        assert.equal(await page.evaluate(() => snapshotData()), snapshot);
        await page.locator('[data-i18n="painting.layers"]').click();
        await page.locator('.painting-layer-edit-row').first().getByRole('button', { name: 'Переместить слой ниже' }).click();
        await page.locator('.painting-dialog button[type="submit"]').click();
        assert.equal(await page.evaluate(() => tasks[0].layerId), layerId);
        await page.locator('#undo-btn').click();

        // Removing an area never deletes its tasks; undo restores references.
        await page.locator('.painting-area-edit').first().click();
        await page.locator('.painting-delete').click();
        assert.equal(await page.evaluate(() => tasks[0].areaId), null);
        assert.equal(await page.evaluate(() => tasks.length), 2);
        await page.locator('#undo-btn').click();
        assert.equal(await page.evaluate(() => snapshotData()), snapshot);

        const saved = await page.evaluate(async () => {
            let output;
            fileHandle = { name: 'test.json', createWritable: async () => ({ write: async payload => { output = payload; }, close: async () => {} }) };
            await save(); fileHandle = null;
            loadData(output); render();
            return { written: JSON.parse(output), reloaded: getSaveData() };
        });
        assert.deepEqual(saved.written, saved.reloaded);
        await page.evaluate(() => {
            loadData(JSON.stringify({ tasks: [{ text: '<img src=x onerror=alert(1)>', done: false, days: [], areaId: 'missing', layerId: 'missing' }] })); render();
        });
        assert.equal(await page.evaluate(() => tasks[0].areaId), null);
        assert.equal(await page.locator('#tasks-active-area img').count(), 0);
        await page.evaluate(async () => { await I18n.setLang('en'); applyTabLabels(); render(); });
        assert.equal(await page.locator('[data-tab="painting"]').textContent(), 'Painting');
        assert.equal(await page.locator('[data-i18n="painting.layers"]').textContent(), 'Layers…');
        await page.goto(base + '/');
        await page.waitForFunction(() => document.documentElement.classList.contains('i18n-ready'));
        await page.locator('.desktop-icon-companion').click();
        const bounds = await page.locator('[data-app-id="tasks"]').boundingBox();
        assert(Math.abs(bounds.width / bounds.height - 16 / 9) < 0.01);
        assert(bounds.x + bounds.width <= 1120);
        assert.deepEqual(errors, []);
        console.log('PASS: legacy files, hierarchy, assignments, 36-task layout, hover/pinning, completion order, layer count/order/removal, area removal, cancel, undo/redo, save/reload, escaping, EN/RU and desktop shell.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
