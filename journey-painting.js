/* Shared area/layer metadata; tasks remain the sole source of completion/dates. */
function paintingText(key) { return I18n.t('painting.' + key); }

function paintingId() { return crypto.randomUUID(); }

function normalizePainting(raw) {
    function entries(values) {
        const seen = new Set();
        return (Array.isArray(values) ? values : []).filter(item => {
            if (!item || typeof item.id !== 'string' || !item.id || seen.has(item.id) || typeof item.name !== 'string' || !item.name.trim()) return false;
            seen.add(item.id);
            return true;
        }).map(item => ({ id: item.id, name: item.name.trim() }));
    }
    const areas = entries(raw && raw.areas);
    let layers = entries(raw && raw.layers);
    if (!layers.length) layers = ['foundation', 'assembly', 'detail', 'polish'].map(key => ({ id: 'layer-' + key, name: paintingText(key) }));
    return { areas, layers };
}

function normalizePaintingTask(raw, index) {
    const task = raw && typeof raw === 'object' ? raw : {};
    const areaId = painting.areas.some(a => a.id === task.areaId) ? task.areaId : null;
    const layerId = areaId && painting.layers.some(l => l.id === task.layerId) ? task.layerId : null;
    return { text: typeof task.text === 'string' ? task.text : '', done: !!task.done, days: Array.isArray(task.days) ? task.days : [], areaId, layerId, order: Number.isFinite(task.order) ? task.order : index };
}

function appendTaskPaintingSelects(row, index) {
    const task = tasks[index];
    const controls = document.createElement('div');
    controls.className = 'task-painting-selects';
    function makeSelect(field, entries, emptyLabel) {
        const select = document.createElement('select');
        select.dataset.field = field;
        select.setAttribute('aria-label', paintingText(field === 'areaId' ? 'area' : 'layer') + ': ' + task.text);
        select.add(new Option(emptyLabel, ''));
        entries.forEach(entry => select.add(new Option(entry.name, entry.id)));
        select.value = task[field] || '';
        select.title = select.selectedOptions[0].textContent;
        select.disabled = editingTaskIndex === index || (field === 'layerId' && !task.areaId);
        select.addEventListener('change', () => {
            if ((task[field] || '') === select.value) return;
            recordUndo();
            task[field] = select.value || null;
            if (!task.areaId) task.layerId = null;
            save();
            render();
        });
        return select;
    }
    controls.append(makeSelect('areaId', painting.areas, paintingText('noArea')), makeSelect('layerId', painting.layers, paintingText('noLayer')));
    row.insertBefore(controls, row.querySelector('.task-actions'));
}

const paintingGroupCollapsed = new Set();
function renderTaskPaintingGroups(container, indices, prefix) {
    function group(parent, title, key) {
        const details = document.createElement('details');
        details.className = 'task-painting-group';
        details.open = !paintingGroupCollapsed.has(prefix + key);
        const summary = document.createElement('summary');
        summary.textContent = title;
        details.append(summary);
        details.addEventListener('toggle', () => {
            if (!details.isConnected) return;
            if (details.open) paintingGroupCollapsed.delete(prefix + key);
            else paintingGroupCollapsed.add(prefix + key);
        });
        parent.append(details);
        return details;
    }
    function list(parent, members) {
        const ul = document.createElement('ul');
        ul.className = 'task-list';
        members.forEach(index => appendTaskToUl(ul, index));
        parent.append(ul);
    }
    const unassigned = indices.filter(i => !tasks[i].areaId);
    if (unassigned.length) list(group(container, paintingText('noArea'), 'unassigned'), unassigned);
    painting.areas.forEach(area => {
        const members = indices.filter(i => tasks[i].areaId === area.id);
        if (!members.length) return;
        const parent = group(container, area.name, area.id);
        const noLayer = members.filter(i => !tasks[i].layerId);
        if (noLayer.length) list(group(parent, paintingText('noLayer'), area.id + ':none'), noLayer);
        painting.layers.forEach((layer, order) => {
            const layerMembers = members.filter(i => tasks[i].layerId === layer.id);
            if (layerMembers.length) list(group(parent, (order + 1) + '. ' + layer.name, area.id + ':' + layer.id), layerMembers);
        });
    });
}

let paintingPinnedTask = null;
function renderPainting() {
    const canvas = document.getElementById('painting-canvas');
    if (!canvas) return;
    paintingPinnedTask = null;
    canvas.replaceChildren();
    showPaintingTask(null);
    if (!painting.areas.length) {
        const empty = document.createElement('p');
        empty.className = 'painting-empty';
        empty.textContent = paintingText('empty');
        canvas.append(empty);
    }
    painting.areas.forEach(area => {
        const section = document.createElement('section');
        section.className = 'painting-area';
        const heading = document.createElement('div');
        heading.className = 'painting-area-heading';
        const title = document.createElement('h2');
        title.textContent = area.name;
        title.title = area.name;
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'task-btn painting-area-edit';
        edit.textContent = '…';
        edit.title = paintingText('editArea');
        edit.setAttribute('aria-label', paintingText('editArea') + ': ' + area.name);
        edit.onclick = () => openPaintingAreaDialog(area.id);
        heading.append(title, edit);
        section.append(heading);
        const bands = document.createElement('div');
        bands.className = 'painting-bands';
        const members = tasks.map((task, index) => ({ task, index })).filter(t => t.task.areaId === area.id);
        let earlierComplete = true;
        const layers = painting.layers.map(layer => ({ ...layer }));
        if (members.some(t => !t.task.layerId)) layers.push({ id: null, name: paintingText('noLayer') });
        layers.forEach(layer => {
            const layerTasks = members.filter(t => (t.task.layerId || null) === layer.id);
            const band = document.createElement('div');
            band.className = 'painting-band';
            const label = document.createElement('span');
            label.className = 'painting-band-label';
            label.textContent = layer.name;
            label.title = layer.name;
            const strokes = document.createElement('div');
            strokes.className = 'painting-strokes';
            layerTasks.forEach(({ task, index }) => {
                const early = !!layer.id && task.done && !earlierComplete;
                const stroke = document.createElement('button');
                stroke.type = 'button';
                stroke.className = 'painting-stroke' + (task.done ? (early ? ' is-early' : ' is-done') : '');
                stroke.dataset.taskIndex = String(index);
                stroke.setAttribute('aria-pressed', 'false');
                const state = paintingText(early ? 'early' : task.done ? 'done' : 'pending');
                stroke.setAttribute('aria-label', task.text + ' — ' + layer.name + ' — ' + state);
                stroke.title = task.text;
                const text = document.createElement('span');
                text.textContent = task.text;
                stroke.append(text);
                const describe = () => showPaintingTask({ index, area: area.name, layer: layer.name, state });
                stroke.addEventListener('mouseenter', describe);
                stroke.addEventListener('focus', describe);
                stroke.addEventListener('mouseleave', () => showPaintingTask(paintingPinnedTask));
                stroke.addEventListener('blur', () => showPaintingTask(paintingPinnedTask));
                stroke.addEventListener('click', () => {
                    paintingPinnedTask = { index, area: area.name, layer: layer.name, state };
                    canvas.querySelectorAll('.painting-stroke').forEach(cell => cell.setAttribute('aria-pressed', String(cell === stroke)));
                    describe();
                });
                strokes.append(stroke);
            });
            if (!layerTasks.length) {
                const empty = document.createElement('div');
                empty.className = 'painting-band-empty';
                empty.title = paintingText('unplanned');
                empty.setAttribute('aria-label', layer.name + ': ' + paintingText('unplanned'));
                strokes.append(empty);
            }
            band.append(label, strokes);
            bands.append(band);
            if (layer.id) earlierComplete = earlierComplete && layerTasks.length > 0 && layerTasks.every(t => t.task.done);
        });
        section.append(bands);
        canvas.append(section);
    });
}

function showPaintingTask(selection) {
    const preview = document.getElementById('painting-task-preview');
    if (!preview) return;
    preview.replaceChildren();
    if (!selection || !tasks[selection.index]) return;
    const name = document.createElement('span');
    name.textContent = tasks[selection.index].text;
    const path = document.createElement('small');
    path.textContent = selection.area + ' / ' + selection.layer + ' · ' + selection.state;
    preview.append(name, path);
}

function paintingDialog(title) {
    document.querySelector('.painting-dialog')?.remove();
    const dialog = document.createElement('dialog');
    dialog.className = 'painting-dialog';
    dialog.setAttribute('aria-labelledby', 'painting-dialog-title');
    const heading = document.createElement('div');
    heading.className = 'title-bar';
    const lines = document.createElement('div');
    lines.className = 'title-bar-lines';
    lines.setAttribute('aria-hidden', 'true');
    const caption = document.createElement('span');
    caption.className = 'title-bar-text';
    caption.id = 'painting-dialog-title';
    caption.setAttribute('role', 'heading');
    caption.setAttribute('aria-level', '2');
    caption.textContent = title;
    heading.append(lines, caption);
    const form = document.createElement('form');
    form.className = 'painting-dialog-body';
    dialog.append(heading, form);
    const opener = document.activeElement;
    dialog.addEventListener('close', () => { dialog.remove(); if (opener?.isConnected) opener.focus(); });
    document.body.append(dialog);
    return { dialog, form };
}

function paintingDialogButton(text, action, className = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mac-btn ' + className;
    button.textContent = text;
    button.onclick = action;
    return button;
}

function commitPaintingSettings(dialog) {
    save();
    render();
    dialog.close();
}

function openPaintingAreaDialog(id = null) {
    const area = painting.areas.find(a => a.id === id);
    const { dialog, form } = paintingDialog(paintingText(area ? 'editArea' : 'addArea'));
    const label = document.createElement('label');
    label.textContent = paintingText('areaName');
    const input = document.createElement('input');
    input.type = 'text';
    input.name = 'areaName';
    input.required = true;
    input.maxLength = 100;
    input.value = area ? area.name : '';
    label.append(input);
    form.append(label);
    const actions = document.createElement('div');
    actions.className = 'painting-dialog-actions';
    if (area) {
        const note = document.createElement('p');
        note.className = 'painting-dialog-note';
        note.textContent = paintingText('removeAreaNote');
        form.append(note);
        actions.append(paintingDialogButton(paintingText('delete'), () => {
            recordUndo();
            painting.areas = painting.areas.filter(a => a.id !== area.id);
            tasks.forEach(task => { if (task.areaId === area.id) { task.areaId = null; task.layerId = null; } });
            commitPaintingSettings(dialog);
        }, 'painting-delete'));
    }
    actions.append(paintingDialogButton(paintingText('cancel'), () => dialog.close()));
    const submit = paintingDialogButton(paintingText('save'), null);
    submit.type = 'submit';
    actions.append(submit);
    form.append(actions);
    form.onsubmit = event => {
        event.preventDefault();
        if (!input.value.trim()) { input.setCustomValidity(paintingText('nameRequired')); input.reportValidity(); return; }
        recordUndo();
        if (area) area.name = input.value.trim();
        else painting.areas.push({ id: paintingId(), name: input.value.trim() });
        commitPaintingSettings(dialog);
    };
    input.oninput = () => input.setCustomValidity('');
    dialog.showModal();
    input.focus();
}

function openPaintingLayersDialog() {
    const { dialog, form } = paintingDialog(paintingText('layers'));
    let draft = painting.layers.map(layer => ({ ...layer }));
    if (!draft.length) draft = normalizePainting(null).layers;
    const countLabel = document.createElement('label');
    countLabel.className = 'painting-layer-count';
    countLabel.textContent = paintingText('layerCount');
    const count = document.createElement('input');
    count.type = 'number'; count.min = '1'; count.max = '20'; count.step = '1'; count.required = true; count.value = draft.length;
    countLabel.append(count);
    const list = document.createElement('div');
    list.className = 'painting-layer-edit-list';
    const note = document.createElement('p');
    note.className = 'painting-dialog-note';
    note.textContent = paintingText('layersNote');
    form.append(countLabel, list, note);
    function redraw() {
        count.value = draft.length;
        list.replaceChildren();
        draft.forEach((layer, index) => {
            const row = document.createElement('div');
            row.className = 'painting-layer-edit-row';
            const number = document.createElement('span'); number.textContent = index + 1;
            const name = document.createElement('input');
            name.type = 'text'; name.required = true; name.maxLength = 60; name.value = layer.name;
            name.setAttribute('aria-label', paintingText('layer') + ' ' + (index + 1));
            name.oninput = () => { layer.name = name.value; name.setCustomValidity(''); };
            row.append(number, name);
            [['↑', -1, 'moveUp'], ['↓', 1, 'moveDown']].forEach(([text, delta, key]) => {
                const button = paintingDialogButton(text, () => {
                    [draft[index], draft[index + delta]] = [draft[index + delta], draft[index]];
                    redraw();
                });
                button.className = 'task-btn';
                button.setAttribute('aria-label', paintingText(key));
                button.disabled = index + delta < 0 || index + delta >= draft.length;
                row.append(button);
            });
            const remove = paintingDialogButton('×', () => { draft.splice(index, 1); redraw(); });
            remove.className = 'task-btn';
            remove.setAttribute('aria-label', paintingText('removeLayer'));
            remove.disabled = draft.length === 1;
            row.append(remove);
            list.append(row);
        });
    }
    count.onchange = () => {
        if (!count.checkValidity()) { count.reportValidity(); return; }
        const value = Number(count.value);
        while (draft.length < value) draft.push({ id: paintingId(), name: paintingText('layer') + ' ' + (draft.length + 1) });
        draft = draft.slice(0, value);
        redraw();
    };
    const actions = document.createElement('div'); actions.className = 'painting-dialog-actions';
    actions.append(paintingDialogButton(paintingText('cancel'), () => dialog.close()));
    const submit = paintingDialogButton(paintingText('save'), null); submit.type = 'submit'; actions.append(submit);
    form.append(actions);
    form.onsubmit = event => {
        event.preventDefault();
        const empty = draft.findIndex(layer => !layer.name.trim());
        if (empty >= 0) { const input = list.querySelectorAll('input')[empty]; input.setCustomValidity(paintingText('nameRequired')); input.reportValidity(); return; }
        recordUndo();
        painting.layers = draft.map(layer => ({ ...layer, name: layer.name.trim() }));
        const ids = new Set(painting.layers.map(layer => layer.id));
        tasks.forEach(task => { if (!ids.has(task.layerId)) task.layerId = null; });
        commitPaintingSettings(dialog);
    };
    redraw();
    dialog.showModal();
}
