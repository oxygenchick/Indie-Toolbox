/* Optional one-way export of dated Journey Book tasks to a selected calendar. */
const JourneyCalendar = (() => {
    const SCOPES = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly';
    const API = 'https://www.googleapis.com/calendar/v3';
    const CLIENT_KEY = 'indietoolbox_google_calendar_client_id';
    let token = '';
    let clientId = '';
    let dialog = null;
    let syncQueue = Promise.resolve();
    let lastSynced = '';
    let syncTimer = null;

    function label(key) { return I18n.t('calendar.' + key); }
    function status(message, error = false) {
        const target = dialog?.querySelector('[data-calendar-status]');
        if (target) { target.textContent = message; target.style.color = error ? '#a00000' : ''; }
        const button = document.getElementById('calendar-sync-button');
        if (button) button.title = message;
    }
    function savedClientId() { try { return localStorage.getItem(CLIENT_KEY) || ''; } catch (_) { return ''; } }
    function rememberClientId(value) { try { localStorage.setItem(CLIENT_KEY, value); } catch (_) {} }
    function updateButton() {
        const button = document.getElementById('calendar-sync-button');
        if (button) button.textContent = calendarSync?.calendarId ? label('connectedButton') : label('button');
    }
    function onFileLoaded() {
        lastSynced = '';
        clearTimeout(syncTimer);
        updateButton();
        if (dialog) dialog.close();
    }
    function validDay(day) {
        if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
        const date = new Date(day + 'T00:00:00Z');
        return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === day;
    }
    function nextDay(day) {
        const date = new Date(day + 'T00:00:00Z');
        date.setUTCDate(date.getUTCDate() + 1);
        return date.toISOString().slice(0, 10);
    }
    function eventId(projectId, taskId, day) {
        return 'it' + projectId.replace(/-/g, '').toLowerCase() + taskId.replace(/-/g, '').toLowerCase() + day.replace(/-/g, '');
    }
    function desiredEvents() {
        const events = new Map();
        if (!calendarSync) return events;
        for (const task of tasks) {
            for (const day of new Set(Array.isArray(task.days) ? task.days : [])) {
                if (!validDay(day)) continue;
                const id = eventId(calendarSync.projectId, task.id, day);
                events.set(id, {
                    id,
                    summary: task.text || label('untitledTask'),
                    start: { date: day }, end: { date: nextDay(day) },
                    transparency: 'transparent',
                    extendedProperties: { private: { indietoolboxProject: calendarSync.projectId, indietoolboxTask: task.id, indietoolboxDay: day } }
                });
            }
        }
        return events;
    }
    function fingerprint() {
        return JSON.stringify([calendarSync, tasks.map(task => [task.id, task.text, [...new Set((task.days || []).filter(validDay))].sort()])]);
    }
    async function request(path, options = {}) {
        const response = await fetch(API + path, {
            ...options,
            headers: { Authorization: 'Bearer ' + token, ...(options.body ? { 'Content-Type': 'application/json' } : {}) }
        });
        if (response.status === 401) {
            token = '';
            throw new Error(label('sessionExpired'));
        }
        if (!response.ok) {
            let detail = '';
            try { detail = (await response.json()).error?.message || ''; } catch (_) {}
            throw new Error(detail || `Google Calendar: HTTP ${response.status}`);
        }
        return response.status === 204 ? null : response.json();
    }
    async function pages(path) {
        const items = [];
        let pageToken = '';
        do {
            const separator = path.includes('?') ? '&' : '?';
            const result = await request(path + (pageToken ? separator + 'pageToken=' + encodeURIComponent(pageToken) : ''));
            items.push(...(result.items || []));
            pageToken = result.nextPageToken || '';
        } while (pageToken);
        return items;
    }
    async function calendars() {
        return pages('/users/me/calendarList?minAccessRole=writer&maxResults=250');
    }
    async function syncNow(force = false) {
        if (!calendarSync || !token || !fileHandle || unsavedChanges) return;
        const selected = { ...calendarSync };
        const current = fingerprint();
        if (!force && current === lastSynced) return;
        status(label('syncing'));
        const path = '/calendars/' + encodeURIComponent(selected.calendarId) + '/events';
        const existing = await pages(path + '?showDeleted=false&maxResults=250&privateExtendedProperty=' + encodeURIComponent('indietoolboxProject=' + selected.projectId));
        const wanted = desiredEvents();
        if (calendarSync?.calendarId !== selected.calendarId || calendarSync?.projectId !== selected.projectId) return;
        for (const event of existing) {
            const desired = wanted.get(event.id);
            if (!desired) {
                await request(path + '/' + encodeURIComponent(event.id), { method: 'DELETE' });
                continue;
            }
            wanted.delete(event.id);
            if (event.summary !== desired.summary || event.start?.date !== desired.start.date || event.end?.date !== desired.end.date) {
                await request(path + '/' + encodeURIComponent(event.id), { method: 'PATCH', body: JSON.stringify({ summary: desired.summary, start: desired.start, end: desired.end }) });
            }
        }
        for (const event of wanted.values()) {
            await request(path, { method: 'POST', body: JSON.stringify(event) });
        }
        lastSynced = current;
        status(label('synced'));
    }
    function enqueue(force = false) {
        if (!token) { status(label('sessionInactive'), true); return Promise.resolve(); }
        if (!calendarSync) { status(label('notSelected'), true); return Promise.resolve(); }
        syncQueue = syncQueue.catch(() => {}).then(() => syncNow(force)).catch(error => {
            console.warn('Google Calendar sync failed:', error);
            status(error.message || label('syncFailed'), true);
        });
        return syncQueue;
    }
    function onSaved() {
        if (!calendarSync || !token) return;
        clearTimeout(syncTimer);
        syncTimer = setTimeout(() => enqueue(), 400);
    }
    function addText(parent, value) {
        const p = document.createElement('p'); p.textContent = value; parent.append(p); return p;
    }
    function connect() {
        const input = dialog?.querySelector('[data-calendar-client]');
        const id = input?.value.trim() || '';
        if (!/^[0-9]+-[a-z0-9_-]+\.apps\.googleusercontent\.com$/i.test(id)) {
            status(label('invalidClient'), true); return;
        }
        if (!window.google?.accounts?.oauth2) { status(label('scriptUnavailable'), true); return; }
        clientId = id;
        rememberClientId(id);
        const oauth = google.accounts.oauth2.initTokenClient({
            client_id: id, scope: SCOPES,
            callback: async result => {
                if (result.error || !result.access_token) { status(result.error_description || result.error || label('authFailed'), true); return; }
                token = result.access_token;
                status(label('loadingCalendars'));
                try { await showCalendars(await calendars()); }
                catch (error) { status(error.message, true); }
            },
            error_callback: error => status(error.message || error.type || label('authFailed'), true)
        });
        // A direct click handler keeps the browser's user activation for Google's popup.
        oauth.requestAccessToken({ prompt: token ? '' : 'consent' });
    }
    async function showCalendars(items) {
        if (!dialog?.isConnected) return;
        const slot = dialog.querySelector('[data-calendar-picker]');
        slot.replaceChildren();
        if (!items.length) { status(label('noWritableCalendars'), true); return; }
        const select = document.createElement('select');
        select.setAttribute('aria-label', label('chooseCalendar'));
        for (const item of items) select.add(new Option(item.summary || item.id, item.id));
        if (calendarSync?.calendarId && items.some(item => item.id === calendarSync.calendarId)) select.value = calendarSync.calendarId;
        const choose = paintingDialogButton(label('useCalendar'), async () => {
            if (!fileHandle) { status(label('saveFileFirst'), true); return; }
            const previous = calendarSync;
            calendarSync = { projectId: previous?.projectId || crypto.randomUUID(), calendarId: select.value };
            lastSynced = '';
            updateButton();
            await save();
            if (unsavedChanges) { calendarSync = previous; updateButton(); status(label('saveFileFirst'), true); return; }
            await enqueue(true);
            const current = dialog?.querySelector('[data-calendar-current]');
            if (current) current.textContent = label('currentCalendar') + ': ' + select.selectedOptions[0].textContent;
            if (previous?.calendarId && previous.calendarId !== select.value) status(label('oldCalendarRemains'));
        });
        slot.append(select, choose);
        status(label('chooseCalendar'));
    }
    function open() {
        if (dialog) dialog.close();
        const built = paintingDialog(label('title'));
        dialog = built.dialog;
        const form = built.form;
        form.addEventListener('submit', event => event.preventDefault());
        addText(form, label('explanation'));
        const inputLabel = document.createElement('label');
        inputLabel.textContent = label('clientLabel');
        const input = document.createElement('input');
        input.type = 'text'; input.className = 'painting-name-input'; input.value = clientId || savedClientId();
        input.placeholder = label('clientPlaceholder'); input.setAttribute('aria-label', label('clientLabel'));
        input.dataset.calendarClient = '';
        const connectButton = paintingDialogButton(label('connect'), connect);
        const picker = document.createElement('div'); picker.dataset.calendarPicker = '';
        const info = addText(form, calendarSync?.calendarId ? label('currentCalendar') + ': ' + calendarSync.calendarId : label('notSelected'));
        info.dataset.calendarCurrent = '';
        info.style.overflowWrap = 'anywhere';
        const state = addText(form, token ? label('sessionActive') : label('sessionInactive'));
        state.dataset.calendarStatus = '';
        const actions = document.createElement('div'); actions.className = 'painting-dialog-actions';
        actions.append(connectButton, paintingDialogButton(label('syncNow'), () => enqueue(true)), paintingDialogButton(label('close'), () => built.dialog.close()));
        inputLabel.append(input);
        form.prepend(inputLabel);
        form.append(picker, actions);
        built.dialog.addEventListener('close', () => { if (dialog === built.dialog) dialog = null; });
        built.dialog.showModal();
        input.focus();
    }
    return { open, onSaved, onFileLoaded, updateLanguage: updateButton, syncNow, desiredEvents, validDay, nextDay };
})();
